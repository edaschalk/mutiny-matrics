import { BN } from "@coral-xyz/anchor";

// Base interfaces
export interface BaseSubscription {
  commitment?: 'processed' | 'confirmed' | 'finalized';
}

export interface BaseUpdate {
  slot: number;
  timestamp: number;
}

// Orca Whirlpool interfaces
export interface OrcaWhirlpoolSubscription extends BaseSubscription {
  poolAddress: string;
}

export interface OrcaWhirlpoolUpdate extends BaseUpdate {
  poolAddress: string;
  sqrtPrice: BN;
  liquidity: BN;
  tickCurrentIndex: number;
}

// Jupiter Transaction interfaces
export interface JupiterTransactionSubscription extends BaseSubscription {
  accountInclude?: string[];
  accountExclude?: string[];
  failed?: boolean;
}

export interface JupiterTransactionUpdate extends BaseUpdate {
  signature: string;
  success: boolean;
  accounts: string[];
  error?: string;
}

// Slot Update interfaces
export interface SlotSubscription extends BaseSubscription {
  includeVotes?: boolean;
}

export interface SlotUpdate extends BaseUpdate {
  slot: number;
  parent: number;
  root: number;
  status: 'processed' | 'confirmed' | 'finalized';
}

// Raydium Pool interfaces
export interface RaydiumPoolSubscription extends BaseSubscription {
  poolAddress: string;
  dataSlice?: {
    offset: number;
    length: number;
  };
}

export interface RaydiumPoolUpdate extends BaseUpdate {
  poolAddress: string;
  price: BN;
  tickSpacing: number;
  feeRate: number;
}

// Block Meta interfaces
export interface BlockMetaSubscription extends BaseSubscription {
  subscriptionKey: string;
}

export interface BlockMetaUpdate extends BaseUpdate {
  slot: number;
  blockhash: string;
  parentSlot: number;
  parentBlockhash: string;
  timestamp: number;
  leader: string;
  rewards: any[];
  confirmationTime: number;
} 
