import { GenericGrpcClient } from './genericClient';
import { BlockMetaSubscription, BlockMetaUpdate } from '../types/interfaces';
import { CommitmentLevel } from "@triton-one/yellowstone-grpc";
import { log } from '../../../utils/logger';
import bs58 from 'bs58';

export class BlockMetaClient extends GenericGrpcClient<
  BlockMetaSubscription,
  BlockMetaUpdate
> {
  protected buildSubscribeRequest(): any {
    return {
      slots: {},
      accounts: {},
      transactions: {},
      transactionsStatus: {},
      blocks: {},
      blocksMeta: { blockmetadata: {} },
      entry: {},
      accountsDataSlice: [],
      commitment: CommitmentLevel.PROCESSED
    };
  }

  protected isRelevantUpdate(rawData: any): boolean {
    if (!rawData.blockMeta) {
      return false;
    }

    const requiredFields = [
      'slot',
      'blockhash',
      'rewards',
      'blockTime',
      'blockHeight',
      'parentSlot',
      'parentBlockhash',
      'executedTransactionCount',
      'entriesCount'
    ];
    // console.log(requiredFields.every(field => rawData.blockMeta[field] !== undefined));
    return requiredFields.every(field => rawData.blockMeta[field] !== undefined);
  }

  protected parseUpdate(rawData: any): BlockMetaUpdate | null {
    try {
      const blockMeta = rawData.blockMeta;
      const update: BlockMetaUpdate = {
        slot: Number(blockMeta.slot),
        blockhash: blockMeta.blockhash,
        parentSlot: Number(blockMeta.parentSlot),
        parentBlockhash: blockMeta.parentBlockhash,
        timestamp: Number(blockMeta.blockTime.timestamp),
        leader: blockMeta.leader || 'unknown',
        rewards: blockMeta.rewards.rewards || [],
        confirmationTime: Date.now()
      };
      log.info('Block meta update', { update });
      return update;
    } catch (error) {
      log.error('Error parsing block meta update', error, { module: 'BLOCK_META' });
      return null;
    }
  }

  protected getUpdateKey(update: BlockMetaUpdate): string {
    return 'global';
  }

  protected getSubscriptionKey(subscription: BlockMetaSubscription): string {
    return 'global';
  }

  public async initializeGlobalSubscription(): Promise<void> {
    try {
      log.info('Block meta subscription initializing...', { module: 'BLOCK_META' });
      await this.connect();
      const request = this.buildSubscribeRequest();
      await this.writeToStream(request);
      log.info('Block meta subscription active', { module: 'BLOCK_META' });
    } catch (error) {
      log.error('Failed to initialize block meta subscription', error, { module: 'BLOCK_META' });
      throw error;
    }
  }
} 