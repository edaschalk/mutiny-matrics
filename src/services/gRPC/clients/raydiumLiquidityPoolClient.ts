import { GenericGrpcClient } from './genericClient';
import { RaydiumPoolSubscription, RaydiumPoolUpdate } from '../types/interfaces';
import { CommitmentLevel } from "@triton-one/yellowstone-grpc";
import { BN } from '@coral-xyz/anchor';
import { log } from '../../../utils/logger';
import bs58 from 'bs58';

export class RaydiumLiquidityPoolClient extends GenericGrpcClient<
  RaydiumPoolSubscription,
  RaydiumPoolUpdate
> {
  // Raydium pool account layout offsets
  private static readonly STATUS_OFFSET = 0;  // 1 byte
  private static readonly NONCE_OFFSET = 1;   // 1 byte
  private static readonly TOKEN_A_OFFSET = 2;  // 32 bytes
  private static readonly TOKEN_B_OFFSET = 34; // 32 bytes
  private static readonly RESERVE_A_OFFSET = 66; // 32 bytes
  private static readonly RESERVE_B_OFFSET = 98; // 32 bytes
  private static readonly PRICE_OFFSET = 130;   // 8 bytes
  private static readonly TICK_SPACING_OFFSET = 138; // 2 bytes
  private static readonly FEE_RATE_OFFSET = 140;    // 2 bytes

  private subscribedPools = new Set<string>();

  protected buildSubscribeRequest(): any {
    return {
      slots: {},
      accounts: {
        "raydium_pools": {
          account: [],
          owner: ["675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"], // Raydium V2 program ID
          filters: [],
        },
      },
      transactions: {},
      transactionsStatus: {},
      blocks: {},
      blocksMeta: {},
      entry: {},
      accountsDataSlice: [{
        offset: String(RaydiumLiquidityPoolClient.PRICE_OFFSET),
        length: "16"  // Price (8) + tick spacing (2) + fee rate (2) + extra buffer
      }],
      commitment: CommitmentLevel.PROCESSED,
    };
  }

  protected isRelevantUpdate(rawData: any): boolean {
    try {
      if (!rawData.account?.account) {
        return false;
      }

      const owner = bs58.encode(rawData.account.account.owner);
      if (owner !== '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8') {
        return false;
      }

      const poolAddress = bs58.encode(rawData.account.account.pubkey);
      return this.subscribedPools.has(poolAddress);
    } catch (error) {
      log.error('Error in isRelevantUpdate', error, { module: 'GRPC' });
      return false;
    }
  }

  protected parseUpdate(rawData: any): RaydiumPoolUpdate | null {
    try {
      if (!rawData.account?.account) {
        return null;
      }
      
      const accountData = rawData.account.account;
      const pubkey = bs58.encode(accountData.pubkey);
      
      // Parse price data (8 bytes)
      const priceData = accountData.data.slice(0, 8);
      const price = new BN(priceData, 'le');
      
      // Parse tick spacing (2 bytes)
      const tickSpacingData = accountData.data.slice(8, 10);
      const tickSpacing = tickSpacingData.readUInt16LE(0);
      
      // Parse fee rate (2 bytes)
      const feeRateData = accountData.data.slice(10, 12);
      const feeRate = feeRateData.readUInt16LE(0);

      // Validate price is reasonable
      if (price.isZero()) {
        log.warn(`Zero price for pool ${pubkey}`, { module: 'GRPC' });
        return null;
      }

      const update: RaydiumPoolUpdate = {
        poolAddress: pubkey,
        price,
        tickSpacing,
        feeRate,
        slot: Number(rawData.slot?.slot ?? 0),
        timestamp: Date.now(),
      };

      return update;
    } catch (error) {
      log.error('Error parsing update', error, { module: 'GRPC' });
      return null;
    }
  }

  public subscribeToPool(
    poolAddress: string, 
    callback: (update: RaydiumPoolUpdate) => void
  ): () => void {
    this.subscribedPools.add(poolAddress);

    if (!this.accountSubscribers.has(poolAddress)) {
      this.accountSubscribers.set(poolAddress, new Set());
    }
    this.accountSubscribers.get(poolAddress)!.add(callback);

    const currentUpdate = this.accountUpdates.get(poolAddress);
    if (currentUpdate) {
      callback(currentUpdate);
    }

    return () => {
      const subscribers = this.accountSubscribers.get(poolAddress);
      if (subscribers) {
        subscribers.delete(callback);
        if (subscribers.size === 0) {
          this.accountSubscribers.delete(poolAddress);
          this.subscribedPools.delete(poolAddress);
        }
      }
    };
  }

  protected getSubscriptionKey(subscription: RaydiumPoolSubscription): string {
    return subscription.poolAddress;
  }

  protected getUpdateKey(update: RaydiumPoolUpdate): string {
    return update.poolAddress;
  }

  public async initializeGlobalSubscription(): Promise<void> {
    try {
      await this.connect();
      const request = this.buildSubscribeRequest();
      await this.writeToStream(request);
      log.info('Raydium Liquidity Pool subscription initialized', { module: 'GRPC' });
    } catch (error) {
      log.error('Failed to initialize Raydium subscription', error, { module: 'GRPC' });
      throw error;
    }
  }
} 