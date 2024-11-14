import 'dotenv/config';
import { log } from './utils/logger';
import { GrpcMonitor } from './monitors/grpc-monitor';
import { SolanaMonitor } from './monitors/solana-monitor';

// Move monitor instances to module scope
let grpcMonitor: GrpcMonitor;
// let solanaMonitor: SolanaMonitor;

async function main() {
    grpcMonitor = new GrpcMonitor();
    // solanaMonitor = new SolanaMonitor();

    try {
        log.info('Starting service monitoring...', { 
            env: process.env.NODE_ENV || 'development'
        });

        // Initialize monitors
        await grpcMonitor.initialize();

        // Start monitoring loop
        while (true) {
            await Promise.all([
                grpcMonitor.checkHealth(),
                // solanaMonitor.checkHealth()
            ]);

            // Wait for 1 minute before next check
            await new Promise(resolve => setTimeout(resolve, 60000));
        }
    } catch (error) {
        log.error('Error in main monitoring loop', error);
        await grpcMonitor.shutdown();
        process.exit(1);
    }
}

// Handle process termination
process.on('SIGTERM', async () => {
    log.info('Received SIGTERM signal');
    if (grpcMonitor) {
        await grpcMonitor.shutdown();
    }
    process.exit(0);
});

process.on('SIGINT', async () => {
    log.info('Received SIGINT signal');
    if (grpcMonitor) {
        await grpcMonitor.shutdown();
    }
    process.exit(0);
});

main(); 