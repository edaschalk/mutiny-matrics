import { GenericGrpcClient } from './genericClient';
import { OrcaWhirlpoolSubscription, OrcaWhirlpoolUpdate } from '../types/interfaces';
import { CommitmentLevel } from "@triton-one/yellowstone-grpc";
import { BN } from '@coral-xyz/anchor';
import { log } from '../../../utils/logger';
import bs58 from 'bs58';
import { PriceMath } from '@orca-so/whirlpools-sdk';

export class OrcaWhirlpoolClient extends GenericGrpcClient<
  OrcaWhirlpoolSubscription,
  OrcaWhirlpoolUpdate
> {
  private static readonly SQRT_PRICE_OFFSET = 65;
  private static readonly LIQUIDITY_OFFSET = 81;
  private static readonly TICK_OFFSET = 97;

  protected buildSubscribeRequest(): any {
    return {
      slots: {},
      accounts: {
        "orca_whirlpools": {
          account: [],
          owner: ["whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc"],
          filters: [],
        },
      },
      transactions: {},
      transactionsStatus: {},
      blocks: {},
      blocksMeta: {},
      entry: {},
      accountsDataSlice: [{
        offset: "65",  // Start at sqrt price
        length: "36"   // Get sqrt price (16) + liquidity (16) + tick index (4)
      }],
      commitment: CommitmentLevel.PROCESSED,
    };
  }

  public async initializeGlobalSubscription(): Promise<void> {
    try {
      await this.connect();
      const request = this.buildSubscribeRequest();
      await this.writeToStream(request);
      log.info('Orca Whirlpool global subscription initialized', { module: 'GRPC' });
    } catch (error) {
      log.error('Failed to initialize Orca Whirlpool subscription', error, { module: 'GRPC' });
      throw error;
    }
  }

  protected isRelevantUpdate(rawData: any): boolean {
    try {
      if (!rawData.account?.account) {
        return false;
      }

      const owner = bs58.encode(rawData.account.account.owner);
      if (owner !== 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc') {
        return false;
      }

      const poolAddress = bs58.encode(rawData.account.account.pubkey);
      return true;
    } catch (error) {
      log.error('Error in isRelevantUpdate', error, { module: 'GRPC' });
      return false;
    }
  }

  protected parseUpdate(rawData: any): OrcaWhirlpoolUpdate | null {
    try {
        if (!rawData.account?.account || !rawData.account.account.data) {
            return null;
        }
        
        const accountData = rawData.account.account;
        const data = Buffer.from(accountData.data);

        // Check if we have enough data
        if (data.length < 36) {  // We need at least 36 bytes (16 + 16 + 4)
            return null;
        }
        
        const update: OrcaWhirlpoolUpdate = {
            poolAddress: bs58.encode(accountData.pubkey),
            sqrtPrice: new BN(data.subarray(0, 16), 'le'),
            liquidity: new BN(data.subarray(16, 32), 'le'),
            tickCurrentIndex: data.readInt32LE(32),
            slot: Number(rawData.account.slot || 0),
            timestamp: Date.now(),
        };

        return update;
    } catch (error) {
        log.error('Error parsing update', error, { module: 'GRPC' });
        return null;
    }
  }

  protected getUpdateKey(update: OrcaWhirlpoolUpdate): string {
    return update.poolAddress;
  }

  protected getSubscriptionKey(subscription: OrcaWhirlpoolSubscription): string {
    return subscription.poolAddress;
  }
} 
