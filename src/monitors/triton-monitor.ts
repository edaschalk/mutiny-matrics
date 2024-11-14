import { GrpcManager } from '../services/gRPC/GrpcManager';
import { log } from '../utils/logger';
import { GrpcSubscriptionStatus } from '../services/gRPC/types/enums';

export class TritonMonitor {
    private grpcManager: GrpcManager;

    constructor() {
        this.grpcManager = GrpcManager.getInstance();
    }

    async checkHealth(): Promise<void> {
        try {
            log.info('Checking Triton gRPC health...', { module: 'TRITON' });
            
            // Initialize gRPC connection if not already initialized
            await this.grpcManager.initialize();
            
            // The GrpcManager will automatically handle reconnections and emit status events
            
            log.info('Triton gRPC connection established successfully', { module: 'TRITON' });
        } catch (error) {
            log.error('Triton health check failed', error, { module: 'TRITON' });
            throw error;
        }
    }
} 