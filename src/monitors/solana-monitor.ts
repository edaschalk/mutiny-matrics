import { Connection } from '@solana/web3.js';
import { log } from '../utils/logger';

export class SolanaMonitor {
    private connection: Connection;

    constructor() {
        const isProd = process.env.NODE_ENV === 'production';
        const endpoint = isProd 
            ? process.env.SOLANA_RPC_ENDPOINT_PROD 
            : process.env.SOLANA_RPC_ENDPOINT_DEV;

        if (!endpoint) {
            throw new Error(`SOLANA_RPC_ENDPOINT_${isProd ? 'PROD' : 'DEV'} must be configured`);
        }

        log.info('Initializing Solana Monitor', {
            module: 'SOLANA',
            environment: isProd ? 'production' : 'development',
            endpoint: endpoint.split('@')[0] // Log endpoint without credentials
        });

        this.connection = new Connection(endpoint);
    }

    async checkHealth(): Promise<void> {
        try {
            log.info('Checking Solana network health...', { module: 'SOLANA' });
            
            // Get current slot
            const slot = await this.connection.getSlot();
            
            // Get recent performance samples
            const performance = await this.connection.getRecentPerformanceSamples(1);
            
            log.info('Solana health check completed', {
                module: 'SOLANA',
                currentSlot: slot,
                performance: performance[0]
            });
        } catch (error) {
            log.error('Solana health check failed', error, { module: 'SOLANA' });
        }
    }
} 