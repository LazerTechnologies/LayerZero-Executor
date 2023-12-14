import { AddressLike, BigNumberish, BytesLike } from "ethers";

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

export enum ExecutionState {
    NotExecutable = 0,
    Executable = 1,
    Executed = 2,
}

export type ExecutorStore = {
  sentPacketStore: { [key: string]: { sentEvent: PacketSentEventMessage, paid: boolean } };
};
