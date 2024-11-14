import { GrpcClientType } from './types/enums';
import { GenericGrpcClient } from './clients/genericClient';
import { OrcaWhirlpoolClient } from './clients/orcaWhirlpoolClient';
import { RaydiumLiquidityPoolClient } from './clients/raydiumLiquidityPoolClient';
import { BlockMetaClient } from './clients/blockMetaClient';
import { log } from '../../utils/logger';

export class GrpcManager {
  private static instance: GrpcManager;
  private clients: Map<GrpcClientType, GenericGrpcClient<any, any>> = new Map();

  private constructor(
    private endpoint: string,
    private auth: string,
  ) {}

  public static getInstance(): GrpcManager {
    if (!GrpcManager.instance) {
      const isProd = process.env.NODE_ENV === 'production';
      
      const endpoint = isProd 
        ? process.env.GRPC_ENDPOINT_PROD 
        : process.env.GRPC_ENDPOINT_DEV;
      
      const auth = isProd
        ? process.env.GRPC_AUTH_PROD
        : process.env.GRPC_AUTH_DEV;

      if (!endpoint || !auth) {
        throw new Error(`GRPC_ENDPOINT_${isProd ? 'PROD' : 'DEV'} and GRPC_AUTH_${isProd ? 'PROD' : 'DEV'} must be configured`);
      }

      log.info('Initializing gRPC Manager', {
        module: 'GRPC',
        environment: isProd ? 'production' : 'development',
        endpoint: endpoint.split('@')[0] // Log endpoint without credentials
      });

      GrpcManager.instance = new GrpcManager(endpoint, auth);
    }
    return GrpcManager.instance;
  }

  public async initialize(): Promise<void> {
    try {
      // Initialize Orca Whirlpool client
      const orcaClient = new OrcaWhirlpoolClient(this.endpoint, this.auth);
      await orcaClient.initializeGlobalSubscription();
      this.clients.set(GrpcClientType.ORCA_WHIRLPOOL, orcaClient);

      // Initialize Raydium Pool client
      const raydiumClient = new RaydiumLiquidityPoolClient(this.endpoint, this.auth);
      await raydiumClient.initializeGlobalSubscription();
      this.clients.set(GrpcClientType.RAYDIUM_POOL, raydiumClient);

      // Initialize Block Meta client
      const blockMetaClient = new BlockMetaClient(this.endpoint, this.auth);
      await blockMetaClient.initializeGlobalSubscription();
      this.clients.set(GrpcClientType.BLOCK_META, blockMetaClient);

      log.info('All gRPC clients initialized successfully', { module: 'GRPC' });
    } catch (error) {
      log.error('Failed to initialize gRPC clients', error, { module: 'GRPC' });
      throw error;
    }
  }

  public getClient<T extends GenericGrpcClient<any, any>>(type: GrpcClientType): T {
    const client = this.clients.get(type);
    if (!client) {
      throw new Error(`Client ${type} not initialized`);
    }
    return client as T;
  }

  public async shutdown(): Promise<void> {
    await Promise.all(
      Array.from(this.clients.values()).map(client => client.shutdown())
    );
    this.clients.clear();
    log.info('All gRPC clients shut down', { module: 'GRPC' });
  }
}
