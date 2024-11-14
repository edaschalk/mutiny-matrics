import { EventEmitter } from 'events';
import Client from "@triton-one/yellowstone-grpc";
import { BaseSubscription, BaseUpdate } from '../types/interfaces';
import { GrpcSubscriptionStatus } from '../types/enums';
import { log } from '../../../utils/logger';

export abstract class GenericGrpcClient<
  TSubscription extends BaseSubscription | void,
  TUpdate extends BaseUpdate,
  TRawData = any
> extends EventEmitter {
  protected client: Client;
  protected stream: any;
  protected isConnected: boolean = false;
  protected accountUpdates = new Map<string, TUpdate>();
  protected accountSubscribers = new Map<string, Set<(update: TUpdate) => void>>();
  protected globalSubscribers = new Set<(update: TUpdate) => void>();

  constructor(
    protected endpoint: string,
    protected auth: string
  ) {
    super();
    this.client = new Client(endpoint, auth, undefined);
  }

  protected abstract isRelevantUpdate(rawData: TRawData): boolean;
  protected abstract parseUpdate(rawData: TRawData): TUpdate | null;
  protected abstract buildSubscribeRequest(): any;
  protected abstract getUpdateKey(update: TUpdate): string;
  protected abstract getSubscriptionKey(subscription: TSubscription): string;

  protected async writeToStream(request: any): Promise<void> {
    if (!this.stream) throw new Error('Stream not initialized');

    return new Promise<void>((resolve, reject) => {
      this.stream.write(request, (err: Error | null | undefined) => {
        if (err === null || err === undefined) {
          resolve();
        } else {
          reject(err);
        }
      });
    });
  }

  public async connect(): Promise<void> {
    if (this.isConnected) return;

    try {
      this.stream = await this.client.subscribe();
      this.setupStreamHandlers();
      this.isConnected = true;
      this.emit('status', GrpcSubscriptionStatus.SUBSCRIBED);
    } catch (error) {
      this.emit('status', GrpcSubscriptionStatus.ERROR);
      throw error;
    }
  }

  protected setupStreamHandlers(): void {
    if (!this.stream) return;

    this.stream.on('error', this.handleError.bind(this));
    this.stream.on('end', this.handleDisconnect.bind(this));
    this.stream.on('data', this.handleData.bind(this));
  }

  protected handleData(rawData: TRawData): void {
    try {
      if (!this.isRelevantUpdate(rawData)) {
        return;
      }

      const update = this.parseUpdate(rawData);
      if (update) {
        // First, notify global subscribers
        this.globalSubscribers.forEach(callback => {
          try {
            callback(update);
          } catch (error) {
            log.error('Error in global subscription callback', error, { module: 'GRPC' });
          }
        });

        // Then, notify specific subscribers
        const key = this.getUpdateKey(update);
        const subscribers = this.accountSubscribers.get(key);
        if (subscribers) {
          subscribers.forEach(callback => {
            try {
              callback(update);
            } catch (error) {
              log.error('Error in subscription callback', error, { module: 'GRPC' });
            }
          });
        }
        
        this.accountUpdates.set(key, update);
      }
    } catch (error) {
      log.error('Error in handleData', error, { module: 'GRPC' });
    }
  }

  protected handleError(error: Error): void {
    log.error(`gRPC error in ${this.constructor.name}`, error, { module: 'GRPC' });
    this.emit('status', GrpcSubscriptionStatus.ERROR);
    this.handleDisconnect();
  }

  protected handleDisconnect(): void {
    this.isConnected = false;
    this.emit('status', GrpcSubscriptionStatus.DISCONNECTED);
    setTimeout(() => this.connect(), 1000);
  }

  public abstract initializeGlobalSubscription(): Promise<void>;

  public async shutdown(): Promise<void> {
    if (this.stream) {
      this.stream.end();
    }
    this.isConnected = false;
    this.accountSubscribers.clear();
    this.accountUpdates.clear();
    this.globalSubscribers.clear();
  }

  public subscribe(callback: (update: TUpdate) => void): () => void;
  public subscribe(subscription: TSubscription, callback: (update: TUpdate) => void): () => void;
  public subscribe(
    subscriptionOrCallback: TSubscription | ((update: TUpdate) => void),
    callback?: (update: TUpdate) => void
  ): () => void {
    // Handle global subscription case
    if (typeof subscriptionOrCallback === 'function') {
      this.globalSubscribers.add(subscriptionOrCallback);
      return () => {
        this.globalSubscribers.delete(subscriptionOrCallback);
      };
    }

    // Handle specific subscription case
    const subscription = subscriptionOrCallback;
    const specificCallback = callback!;
    const key = this.getSubscriptionKey(subscription);
    
    if (!this.accountSubscribers.has(key)) {
      this.accountSubscribers.set(key, new Set());
    }
    this.accountSubscribers.get(key)!.add(specificCallback);

    const currentUpdate = this.accountUpdates.get(key);
    if (currentUpdate) {
      specificCallback(currentUpdate);
    }

    return () => {
      const subscribers = this.accountSubscribers.get(key);
      if (subscribers) {
        subscribers.delete(specificCallback);
        if (subscribers.size === 0) {
          this.accountSubscribers.delete(key);
        }
      }
    };
  }
} 