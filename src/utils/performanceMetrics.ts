import { BlockMetaUpdate, OrcaWhirlpoolUpdate } from '../services/gRPC/types/interfaces';
import { log } from './logger';

interface UpdateMetrics {
    poolAddress: string;
    slot: number;
    updateReceivedAt: number;
    blockTime?: number;
    blockReceivedAt?: number;
    updateLatency?: number;
    blockLatency?: number;
}

export class PerformanceMetrics {
    private static instance: PerformanceMetrics;
    private metricsMap = new Map<number, UpdateMetrics[]>();
    private readonly MAX_SLOTS = 1000;
    private logInterval!: NodeJS.Timeout;
    private lastLogTime = Date.now();
    private lastMetrics: string = '';

    private constructor() {
        this.logInterval = setInterval(() => this.logAggregatedMetrics(), 60000);
    }

    public static getInstance(): PerformanceMetrics {
        if (!PerformanceMetrics.instance) {
            PerformanceMetrics.instance = new PerformanceMetrics();
        }
        return PerformanceMetrics.instance;
    }

    public recordAccountUpdate(update: OrcaWhirlpoolUpdate): void {
        const metrics: UpdateMetrics = {
            poolAddress: update.poolAddress,
            slot: update.slot,
            updateReceivedAt: Date.now(),
        };

        if (!this.metricsMap.has(update.slot)) {
            this.metricsMap.set(update.slot, []);
        }
        this.metricsMap.get(update.slot)!.push(metrics);
        this.cleanup();
    }

    public recordBlockMeta(blockMeta: BlockMetaUpdate): void {
        const blockReceivedAt = Date.now();
        const updates = this.metricsMap.get(blockMeta.slot);

        if (updates) {
            updates.forEach(metric => {
                metric.blockTime = blockMeta.timestamp * 1000;
                metric.blockReceivedAt = blockReceivedAt;
                metric.updateLatency = metric.updateReceivedAt - metric.blockTime;
                metric.blockLatency = blockReceivedAt - metric.blockTime;
            });
        }
    }

    private cleanup(): void {
        if (this.metricsMap.size > this.MAX_SLOTS) {
            const slots = Array.from(this.metricsMap.keys()).sort((a, b) => a - b);
            const slotsToRemove = slots.slice(0, slots.length - this.MAX_SLOTS);
            slotsToRemove.forEach(slot => this.metricsMap.delete(slot));
        }
    }

    private formatLatency(min: number, avg: number, max: number): string {
        return `${min.toString().padStart(4)}/${avg.toString().padStart(4)}/${max.toString().padStart(4)}`;
    }

    private logAggregatedMetrics(): void {
        const now = Date.now();
        const metrics = Array.from(this.metricsMap.values())
            .flat()
            .filter(m => 
                m.updateLatency !== undefined && 
                m.blockLatency !== undefined &&
                m.updateReceivedAt > this.lastLogTime
            );

        if (metrics.length === 0) return;

        const updateLatencies = metrics.map(m => m.updateLatency!);
        const blockLatencies = metrics.map(m => m.blockLatency!);

        const stats = {
            updates: metrics.length,
            updateLatency: {
                min: Math.min(...updateLatencies),
                avg: Math.round(updateLatencies.reduce((a, b) => a + b, 0) / updateLatencies.length),
                max: Math.max(...updateLatencies)
            },
            blockLatency: {
                min: Math.min(...blockLatencies),
                avg: Math.round(blockLatencies.reduce((a, b) => a + b, 0) / blockLatencies.length),
                max: Math.max(...blockLatencies)
            }
        };

        const formattedMetrics = {
            module: 'METRICS',
            updates: stats.updates.toString().padStart(3),
            updateLatency: this.formatLatency(
                stats.updateLatency.min,
                stats.updateLatency.avg,
                stats.updateLatency.max
            ),
            blockLatency: this.formatLatency(
                stats.blockLatency.min,
                stats.blockLatency.avg,
                stats.blockLatency.max
            )
        };

        const metricsString = JSON.stringify(formattedMetrics);
        if (metricsString !== this.lastMetrics) {
            log.info('Performance', formattedMetrics);
            this.lastMetrics = metricsString;
        }

        this.lastLogTime = now;
    }

    public shutdown(): void {
        if (this.logInterval) {
            clearInterval(this.logInterval);
        }
        this.metricsMap.clear();
    }
} 