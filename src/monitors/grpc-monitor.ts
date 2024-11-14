import { GrpcManager } from '../services/gRPC/GrpcManager';
import { log } from '../utils/logger';
import { GrpcSubscriptionStatus } from '../services/gRPC/types/enums';
import { PerformanceMetrics } from '../utils/performanceMetrics';
import { GrpcClientType } from '../services/gRPC/types/enums';
import { BlockMetaUpdate, OrcaWhirlpoolUpdate } from '../services/gRPC/types/interfaces';
import { BlockMetaClient } from '../services/gRPC/clients/blockMetaClient';
import { OrcaWhirlpoolClient } from '../services/gRPC/clients/orcaWhirlpoolClient';

export class GrpcMonitor {
    private grpcManager: GrpcManager;
    private metrics: PerformanceMetrics;
    private blockMetaClient?: BlockMetaClient;
    private orcaClient?: OrcaWhirlpoolClient;

    constructor() {
        this.grpcManager = GrpcManager.getInstance();
        this.metrics = PerformanceMetrics.getInstance();
    }

    async initialize(): Promise<void> {
        try {
            log.info('Initializing gRPC monitoring...', { module: 'GRPC_MONITOR' });
            
            // Initialize gRPC connection
            await this.grpcManager.initialize();

            // Get client instances
            this.blockMetaClient = this.grpcManager.getClient<BlockMetaClient>(GrpcClientType.BLOCK_META);
            this.orcaClient = this.grpcManager.getClient<OrcaWhirlpoolClient>(GrpcClientType.ORCA_WHIRLPOOL);

            // Setup performance monitoring
            this.setupPerformanceMonitoring();
            
            log.info('gRPC monitoring initialized successfully', { module: 'GRPC_MONITOR' });
        } catch (error) {
            log.error('Failed to initialize gRPC monitoring', error, { module: 'GRPC_MONITOR' });
            throw error;
        }
    }

    private setupPerformanceMonitoring(): void {
        if (!this.blockMetaClient || !this.orcaClient) {
            throw new Error('Clients not initialized');
        }

        // Monitor block updates - using empty object as subscription
        this.blockMetaClient.subscribe( (update: BlockMetaUpdate) => {
            this.metrics.recordBlockMeta(update);
        });

        // Monitor Orca pool updates
        const poolsToMonitor = process.env.ORCA_POOLS_TO_MONITOR?.split(',') || [];
        poolsToMonitor.forEach(poolAddress => {
            this.orcaClient!.subscribe((update: OrcaWhirlpoolUpdate) => {
                this.metrics.recordAccountUpdate(update);
            });
        });
    }

    async checkHealth(): Promise<void> {
        try {
            log.info('Checking gRPC services health...', { module: 'GRPC_MONITOR' });
            
            // Check client connections using the getClient method
            const blockMetaClient = this.grpcManager.getClient<BlockMetaClient>(GrpcClientType.BLOCK_META);
            const orcaClient = this.grpcManager.getClient<OrcaWhirlpoolClient>(GrpcClientType.ORCA_WHIRLPOOL);

            // Create status map
            const clientStatuses = new Map<string, boolean>();
            
            // Get connection status through GrpcManager
            clientStatuses.set('BlockMeta', blockMetaClient instanceof BlockMetaClient);
            clientStatuses.set('OrcaWhirlpool', orcaClient instanceof OrcaWhirlpoolClient);

            // Log connection statuses
            log.info('gRPC client status check completed', { 
                module: 'GRPC_MONITOR',
                statuses: Object.fromEntries(clientStatuses)
            });

            // Check for disconnected clients
            const disconnectedClients = Array.from(clientStatuses.entries())
                .filter(([_, connected]) => !connected)
                .map(([client]) => client);

            if (disconnectedClients.length > 0) {
                log.warn('Some gRPC clients are disconnected', {
                    module: 'GRPC_MONITOR',
                    disconnectedClients
                });

                // Attempt to reconnect
                await this.grpcManager.initialize();
            }

        } catch (error) {
            log.error('gRPC health check failed', error, { module: 'GRPC_MONITOR' });
            throw error;
        }
    }

    async shutdown(): Promise<void> {
        try {
            await this.grpcManager.shutdown();
            this.metrics.shutdown();
            log.info('gRPC monitor shut down successfully', { module: 'GRPC_MONITOR' });
        } catch (error) {
            log.error('Error shutting down gRPC monitor', error, { module: 'GRPC_MONITOR' });
            throw error;
        }
    }
} 