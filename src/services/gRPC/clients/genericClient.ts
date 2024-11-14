import { EventEmitter } from 'events';
import Client from "@triton-one/yellowstone-grpc";
import { BaseSubscription, BaseUpdate } from '../types/interfaces';
import { GrpcSubscriptionStatus } from '../types/enums';
import { log } from '../../../utils/logger';

interface GrpcError extends Error {
    code?: number;
    details?: string;
    metadata?: any;
}

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
    protected auth?: string
  ) {
    super();
    if (!auth) {
      auth = undefined;
    }

    log.info('Creating gRPC client', {
      module: 'GRPC',
      clientType: this.constructor.name,
      endpoint: endpoint.split('@')[0], // Hide credentials
      hasAuth: !!auth
    });

    if (!endpoint || typeof endpoint !== 'string' || endpoint.trim() === '') {
      throw new Error(`Invalid endpoint provided to ${this.constructor.name}`);
    }

    try {
      this.client = new Client(endpoint, auth, undefined);

      log.info('Using gRPC endpoint', {
        module: 'GRPC',
        clientType: this.constructor.name,
        endpoint: endpoint.split('@')[0], // Hide credentials
      });
    } catch (error) {
      log.error(`Failed to create ${this.constructor.name} client`, error, {
        module: 'GRPC',
        endpoint: endpoint.split('@')[0]
      });
      throw error;
    }
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
      log.info(`Connecting ${this.constructor.name}...`, {
        module: 'GRPC',
        clientType: this.constructor.name,
        endpoint: this.endpoint.split('@')[0]
      });

      this.stream = await this.client.subscribe();
      this.setupStreamHandlers();
      this.isConnected = true;
      this.emit('status', GrpcSubscriptionStatus.SUBSCRIBED);

      log.info(`${this.constructor.name} connected successfully`, {
        module: 'GRPC',
        clientType: this.constructor.name
      });
    } catch (error) {
      const grpcError = error as GrpcError;
      this.handleError(grpcError);
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

  protected handleError(error: GrpcError): void {
    const errorDetails = {
      name: error.name,
      message: error.message,
      code: error.code,
      details: error.details,
      metadata: error.metadata,
      stack: error.stack,
    };

    log.error(`gRPC error in ${this.constructor.name}`, errorDetails, { 
      module: 'GRPC',
      clientType: this.constructor.name,
      endpoint: this.endpoint.split('@')[0], // Log endpoint without credentials
      connectionState: this.isConnected ? 'connected' : 'disconnected'
    });

    if (error.code === 14) { // UNAVAILABLE
      log.error('gRPC service unavailable - Check if the server supports gRPC protocol', {
        module: 'GRPC',
        suggestion: 'Verify server configuration and gRPC port'
      });
    } else if (error.code === 16) { // UNAUTHENTICATED
      log.error('gRPC authentication failed', {
        module: 'GRPC',
        suggestion: 'Check authentication credentials'
      });
    }

    this.emit('status', GrpcSubscriptionStatus.ERROR);
    this.handleDisconnect();
  }

  protected handleDisconnect(): void {
    if (this.isConnected) {
      log.warn(`${this.constructor.name} disconnected, attempting reconnection in 5 seconds`, {
        module: 'GRPC',
        clientType: this.constructor.name
      });
    }
    this.isConnected = false;
    this.emit('status', GrpcSubscriptionStatus.DISCONNECTED);
    
    setTimeout(() => this.connect(), 5000);
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