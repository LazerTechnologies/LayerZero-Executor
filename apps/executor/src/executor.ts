import { id, AbiCoder } from "ethers";
import { hexlify } from "ethers";
import { ILayerZeroEndpointV2 } from "@lz/sdk";
import {
  Options,
  Packet,
  PacketSerializer,
  bytes32ToEthAddress,
  hexZeroPadTo32,
} from "@lz/lz-utility-v2";

import { delay, deriveGuidFromPacketVerifiedEvent } from "./utils";
import type { ExecutorConfig } from "./types";
import {
  ExecutionState,
  ExecutorStore,
  PacketSentEventMessage,
  PacketVerifiedEventMessage,
} from "./types";

class Executor {
  private config: ExecutorConfig;
  private store: ExecutorStore;
  private running: boolean;

  constructor(config: ExecutorConfig) {
    this.config = config;
    this.store = {
      sentPacketStore: {},
    };
    this.running = false;
  }

  async startExecutor() {
    console.log("Starting executor...");

    // Start executor
    this.running = true;

    // Start scan for sent packets on each network, store in packet store when received
    const sentPackets = Promise.all(
      Object.keys(this.config.networks).map((networkId) =>
        this.scanPacketSentEvents(
          networkId,
          this.config.networks[networkId].endpoint,
          this.config.startBlock - 1,
          async (packetSentEvent) => {
            console.log(`[${networkId}] Processing packet sent event...`);

            const packet = PacketSerializer.deserialize(
              packetSentEvent.args.encodedPayload
            );

            // Determine if fee was paid to our executor, if it was continue exeuction evaluation
            const feePaid = await this.queryFeePaid(networkId, packetSentEvent);

            this.store.sentPacketStore[packet.guid] = {
              sentEvent: packetSentEvent,
              paid: feePaid !== null && feePaid > 0n,
            };

            console.log(`[${networkId}] Packet ${packet.guid} stored`);
          }
        )
      )
    );

    // Start scan for delivered / veriifed packets on each network, execute packet if fee was paid
    const verifiedPackets = Promise.all(
      Object.keys(this.config.networks).map((networkId) =>
        this.scanPacketVerifiedEvents(
          networkId,
          this.config.networks[networkId].endpoint,
          this.config.startBlock - 1,
          async (packetVerifiedEvent) => {
            console.log(`[${networkId}] Processing packet verified event...`);

            const dstEid = await this.config.networks[networkId].endpoint.eid();
            const { guid } = deriveGuidFromPacketVerifiedEvent(
              dstEid,
              packetVerifiedEvent
            );

            // Check if packet is in sent packet store
            while (!this.store.sentPacketStore[guid]) {
              console.log(
                `[${networkId}] Waiting for packet with guid ${guid} to be sent from within verified packet event callback...`
              );
              await delay(this.config.delay);
            }

            if (!this.store.sentPacketStore[guid].paid) {
              console.log(
                `[${networkId}] Packet with guid ${guid} was not paid for, no-op from within verified packet event callback...`
              );
              return;
            }

            // Finally, we can determine if we can execute the packet
            const readyForExecution =
              await this.evaluatePacketEventsForExecution(
                networkId,
                this.store.sentPacketStore[guid].sentEvent,
                packetVerifiedEvent
              );

            // Check candicacy for execution
            if (!readyForExecution) {
              console.log(
                `[${networkId}] Packet with guid ${guid} is not candidate for execution, no-op from within verified packet event callback...`
              );
              return;
            }

            // Execute packet
            await this.executePacket(
              networkId,
              PacketSerializer.deserialize(
                this.store.sentPacketStore[guid].sentEvent.args.encodedPayload
              ),
              Options.fromOptions(
                hexlify(this.store.sentPacketStore[guid].sentEvent.args.options)
              )
            );
          }
        )
      )
    );

    // Return the last processed block for each scan function on interrupt
    return Promise.all([sentPackets, verifiedPackets]);
  }

  async stopExecutor() {
    console.log("Stopping executor...");
    this.running = false;
  }

  async queryFeePaid(
    networkId: string,
    packetSentEvent: PacketSentEventMessage
  ): Promise<bigint | null> {
    const txHash = packetSentEvent.transactionHash;

    const receipt =
      await this.config.networks[networkId].provider.getTransactionReceipt(
        txHash
      );

    if (!receipt) {
      console.log(
        `[${networkId}] Failed to retrieve transaction receipt from PacketSentEvent!`
      );
      return null;
    }

    const executorFeePaidEventSignature = id(
      "ExecutorFeePaid(address,uint256)"
    );

    const feePaidEvent = receipt.logs.find(
      (log) => log.topics[0] === executorFeePaidEventSignature
    );

    if (feePaidEvent) {
      const decodedData = AbiCoder.defaultAbiCoder().decode(
        ["address", "uint256"],
        feePaidEvent.data
      );

      return decodedData[1] as bigint;
    } else {
      return null;
    }
  }

  async scanPacketSentEvents(
    networkId: string,
    endpoint: ILayerZeroEndpointV2,
    lastBlock: number,
    onPacketSentEvent: (packetSentEvent: PacketSentEventMessage) => void
  ) {
    let lastProcessedBlock = lastBlock;

    const fetchSentPackets = async () => {
      try {
        const sendPackets = await endpoint.queryFilter(
          endpoint.filters.PacketSent(),
          lastProcessedBlock + 1,
          "latest"
        );

        if (sendPackets.length == 0) {
          console.log(
            `[${networkId}] No sent packets found within range (${
              lastProcessedBlock + 1
            } -> latest)`
          );
          return;
        }

        console.log(
          `[${networkId}] Found ${sendPackets.length} sent packets: ` +
            JSON.stringify(sendPackets, null, 4)
        );

        sendPackets.map(async (sp) =>
          onPacketSentEvent({
            args: {
              encodedPayload: sp.args.encodedPayload,
              options: sp.args.options,
              sendLibrary: sp.args.sendLibrary,
            },
            transactionHash: sp.transactionHash,
            blockNumber: BigInt((await sp.getBlock()).number),
          })
        );

        lastProcessedBlock = sendPackets[sendPackets.length - 1].blockNumber;
      } catch (error) {
        console.error(`[${networkId}] Error fetching packets:`, error);
      }
    };

    console.log(`[${networkId}] Starting to scan for sent packets...`);

    while (this.running) {
      await fetchSentPackets();
      await delay(this.config.delay);
    }

    return lastProcessedBlock;
  }

  async scanPacketVerifiedEvents(
    networkId: string,
    endpoint: ILayerZeroEndpointV2,
    lastBlock: number,
    onPacketVerifiedEvent: (event: PacketVerifiedEventMessage) => void
  ) {
    let lastProcessedBlock = lastBlock;

    const fetchVerifiedPackets = async () => {
      try {
        const verifiedPackets = await endpoint.queryFilter(
          endpoint.filters.PacketVerified(),
          lastProcessedBlock + 1,
          "latest"
        );

        if (verifiedPackets.length == 0) {
          console.log(
            `[${networkId}] No verified packets found within range (${
              lastProcessedBlock + 1
            } -> latest)`
          );
          return;
        }

        console.log(
          `[${networkId}] Found ${verifiedPackets.length} verified packets: ` +
            JSON.stringify(verifiedPackets, null, 4)
        );

        verifiedPackets.map(async (pv) =>
          onPacketVerifiedEvent({
            args: {
              origin: {
                srcEid: pv.args.origin.srcEid,
                sender: pv.args.origin.sender,
                nonce: pv.args.origin.nonce,
              },
              receiver: pv.args.receiver,
              payloadHash: pv.args.payloadHash,
            },
            transactionHash: pv.transactionHash,
            blockNumber: BigInt((await pv.getBlock()).number),
          })
        );

        lastProcessedBlock =
          verifiedPackets[verifiedPackets.length - 1].blockNumber;
      } catch (error) {
        console.error(`[${networkId}] Error fetching packets:`, error);
      }
    };

    console.log(`[${networkId}] Starting to scan for delivered packets...`);

    while (this.running) {
      await fetchVerifiedPackets();
      await delay(this.config.delay);
    }

    return lastProcessedBlock;
  }

  async evaluatePacketEventsForExecution(
    networkId: string,
    packetSentEvent: PacketSentEventMessage,
    packetVerifiedEvent: PacketVerifiedEventMessage
  ) {
    let executable: BigInt;
    const packet = PacketSerializer.deserialize(
      packetSentEvent.args.encodedPayload
    );
    const origin = packetVerifiedEvent.args.origin;

    while (true) {
      executable = await this.config.networks[networkId].endpoint.executable(
        origin,
        packet.receiver
      );

      if (executable === BigInt(ExecutionState.Executable)) {
        console.log(`[${networkId}] Packet ${packet.guid} is executable`);
        return true;
      }

      if (executable === BigInt(ExecutionState.Executed)) {
        console.log(
          `[${networkId}] Packet ${packet.guid} has already been executed, aborting`
        );
        return false;
      }

      await delay(this.config.delay);
    }
  }

  async executePacket(
    networkId: string,
    packet: Packet,
    options: Options
  ): Promise<void> {
    const lzReceiverOptions = options.decodeExecutorLzReceiveOption();

    if (!lzReceiverOptions) {
      console.log(
        `[${networkId}] Packet does not contain executor options, aborting`
      );
      return;
    }

    const origin = {
      srcEid: packet.srcEid,
      sender: packet.sender,
      nonce: packet.nonce,
    };

    // Build lzReceive transaction
    const tx = await this.config.networks[
      networkId
    ].endpoint.lzReceive.populateTransaction(
      origin,
      bytes32ToEthAddress(packet.receiver),
      hexZeroPadTo32(packet.guid),
      packet.message,
      "0x" // Extra data unsupported at this time
    );

    tx.gasLimit = lzReceiverOptions?.gas.toBigInt();
    tx.value = lzReceiverOptions?.value.toBigInt();

    // Send transaction on destination network
    const txResponse =
      await this.config.networks[networkId].wallet.sendTransaction(tx);
  }
}

export { Executor };
