import pino from 'pino';
import path from 'path';

const LOG_FILE_PATH = process.env.LOG_FILE_PATH || './logs';
const ERROR_LOG_PATH = process.env.ERROR_LOG_PATH || path.join(LOG_FILE_PATH, 'error.log');
const COMBINED_LOG_PATH = process.env.COMBINED_LOG_PATH || path.join(LOG_FILE_PATH, 'combined.log');

interface LogContext {
    module?: string;
    [key: string]: any;
}

// Track previous states to detect changes
const previousStates = new Map<string, any>();

// Create the logger instance immediately
const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    timestamp: pino.stdTimeFunctions.isoTime,
    transport: {
        targets: [
            {
                target: 'pino-pretty',
                level: 'info',
                options: {
                    colorize: true,
                    ignore: 'pid,hostname',
                    translateTime: 'yyyy-mm-dd HH:MM:ss',
                    messageFormat: '{msg}',
                    singleLine: true
                }
            },
            {
                target: 'pino/file',
                level: 'info',
                options: {
                    destination: COMBINED_LOG_PATH,
                    mkdir: true
                }
            },
            {
                target: 'pino/file',
                level: 'error',
                options: {
                    destination: ERROR_LOG_PATH,
                    mkdir: true
                }
            }
        ]
    }
});

// Format context for logging
const formatContext = (context?: LogContext): string => {
    if (!context) return '';
    
    // Special formatting for performance metrics
    if (context.module === 'METRICS') {
        const { module, updates, updateLatency, blockLatency } = context;
        return `[${module}] Updates: ${updates} | Update Latency (min/avg/max): ${updateLatency} | Block Latency: ${blockLatency}`;
    }
    
    // For status updates
    if (context.module === 'GRPC_MONITOR' || context.module === 'SOLANA') {
        if (context.status) {
            return `[${context.module}] Status: ${context.status}`;
        }
        return `[${context.module}]`;
    }
    
    return Object.entries(context)
        .map(([key, value]) => `${key}=${value}`)
        .join(', ');
};

// Check if state has changed
const hasStateChanged = (key: string, newState: any): boolean => {
    const previousState = previousStates.get(key);
    const hasChanged = JSON.stringify(previousState) !== JSON.stringify(newState);
    if (hasChanged) {
        previousStates.set(key, JSON.parse(JSON.stringify(newState)));
    }
    return hasChanged;
};

// Utility functions for common logging patterns
export const log = {
    info: (msg: string, context?: LogContext) => {
        // Always show initialization messages
        if (msg.includes('Starting service') || msg.includes('initialized successfully')) {
            const formattedContext = formatContext(context);
            logger.info(`${msg} ${formattedContext}`);
            return;
        }

        // Always show performance metrics
        if (context?.module === 'METRICS') {
            const formattedContext = formatContext(context);
            logger.info(`${msg} ${formattedContext}`);
            return;
        }

        // For status updates, only show if there's a change
        if (context?.module && (context.module === 'GRPC_MONITOR' || context.module === 'SOLANA')) {
            const stateKey = `${context.module}-${msg}`;
            if (hasStateChanged(stateKey, context)) {
                const formattedContext = formatContext(context);
                logger.info(`${msg} ${formattedContext}`);
            }
            return;
        }

        // Skip routine health check logs
        if (msg.includes('health check completed') || 
            msg.includes('Checking') || 
            msg.includes('status check completed')) {
            return;
        }

        const formattedContext = formatContext(context);
        logger.info(`${msg} ${formattedContext}`);
    },
    
    error: (msg: string, error?: Error | unknown, context?: LogContext) => {
        const errorObj = error instanceof Error ? {
            name: error.name,
            message: error.message,
            stack: error.stack
        } : error;

        // Handle cases where error is a plain object
        const formattedError = typeof errorObj === 'object' ? 
            JSON.stringify(errorObj, null, 2) : 
            String(errorObj);

        const errorContext = {
            ...context,
            error: formattedError
        };

        const formattedContext = formatContext(errorContext);
        logger.error(`❌ ${msg} ${formattedContext}`);
    },
    
    warn: (msg: string, context?: LogContext) => {
        const formattedContext = formatContext(context);
        logger.warn(`⚠️ ${msg} ${formattedContext}`);
    },
    
    debug: (msg: string, context?: LogContext) => {
        const formattedContext = formatContext(context);
        logger.debug(`${msg} ${formattedContext}`);
    },

    // For backwards compatibility with your existing code
    legacy: (msg: string, isError: boolean = false, context: string = 'GENERAL') => {
        if (isError) {
            logger.error(`${msg} [${context}]`);
        } else {
            logger.info(`${msg} [${context}]`);
        }
    }
};

// Export the raw logger instance as well
export const rawLogger = logger; 