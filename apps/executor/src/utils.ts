import { BigNumberish, ethers, getBytes, hexlify } from "ethers";
import { PublicKey } from "@solana/web3.js";
import { PacketVerifiedEventMessage } from "./types";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const keccak256 = (message: string) => ethers.keccak256(message);
const hexZeroPadTo32 = (addr: string) => ethers.zeroPadValue(addr, 32);

const addressToBytes32 = (address: string): Uint8Array => {
  if (isSolanaAddress(address)) {
    return new PublicKey(address).toBytes();
  } else if (address.startsWith("0x") && address.length <= 66) {
    return getBytes(hexZeroPadTo32(address));
  }
  throw new Error("Invalid address");
};

const solanaAddressRegex = /^([1-9A-HJ-NP-Za-km-z]{32,44})$/;
const isSolanaAddress = (address: string) => solanaAddressRegex.test(address);

const deriveGuid = (packetHeader: {
  nonce: BigNumberish;
  sender: string;
  receiver: string;
  srcEid: BigNumberish;
  dstEid: BigNumberish;
}) =>
  keccak256(
    ethers.solidityPacked(
      ["uint64", "uint32", "bytes32", "uint32", "bytes32"],
      [
        packetHeader.nonce,
        packetHeader.srcEid,
        addressToBytes32(packetHeader.sender),
        packetHeader.dstEid,
        addressToBytes32(packetHeader.receiver),
      ]
    )
  );

const deriveGuidFromPacketVerifiedEvent = (
  dstEndpointId: any,
  event: PacketVerifiedEventMessage
) => {
  const msg = {
    receiver: event.args.receiver,
    srcEid: event.args.origin.srcEid,
    sender: event.args.origin.sender,
    dstEid: dstEndpointId,
    nonce: event.args.origin.nonce,
    payloadHash: event.args.payloadHash,
  };
  const guid = deriveGuid({ ...msg });
  return { ...msg, guid };
};

export {
  delay,
  hexZeroPadTo32,
  addressToBytes32,
  isSolanaAddress,
  keccak256,
  deriveGuid,
  deriveGuidFromPacketVerifiedEvent,
};
