import { AddressLike, BigNumberish, BytesLike, ethers } from "ethers";
import { ILayerZeroEndpointV2 } from "@lz/sdk";

export type NetworkConfig = {
  rpcUrl: string;
  privateKey: string;
  endpointContractAddress: string;
};

export type NetworkConfigJson = {
  [networkId: string]: NetworkConfig;
};

export type Network = {
  provider: ethers.JsonRpcProvider;
  endpoint: ILayerZeroEndpointV2;
  wallet: ethers.Wallet;
};

export type Networks = {
  [networkId: string]: Network;
}

export type PacketSentEventMessage = {
  args: {
    encodedPayload: BytesLike;
    options: BytesLike;
    sendLibrary: AddressLike;
  };
  transactionHash: string;
  blockNumber: bigint;
}

export type PacketVerifiedEventMessage = {
  args: {
    origin: {
      srcEid: BigNumberish;
      sender: string;
      nonce: BigNumberish;
    };
    receiver: string;
    payloadHash: BytesLike;
  };
  transactionHash: string;
  blockNumber: bigint;
}

export type ExecutorConfig = {
  networks: Networks;
  delay: number;
  startBlock: number;
};

export enum ExecutionState {
    NotExecutable = 0,
    Executable = 1,
    Executed = 2,
}

export type ExecutorStore = {
  sentPacketStore: { [key: string]: { sentEvent: PacketSentEventMessage, paid: boolean } };
};