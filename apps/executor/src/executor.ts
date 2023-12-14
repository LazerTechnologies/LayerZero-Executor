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
import { ExecutorConfig } from "./config";
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

    // Start scan for sent packets, store in packet store when received
    const sentPackets = this.scanPacketSentEvents(
      this.config.sourceEndpoint,
      this.config.startBlock - 1,
      async (packetSentEvent) => {
        console.log(`Processing packet sent event...`);

        const packet = PacketSerializer.deserialize(
          packetSentEvent.args.encodedPayload
        );

        // Determine if fee was paid to our executor, if it was continue exeuction evaluation
        const feePaid = await this.queryFeePaid(packetSentEvent);
        this.store.sentPacketStore[packet.guid] = {
          sentEvent: packetSentEvent,
          paid: feePaid !== null && feePaid > 0n,
        };
      }
    );

    // Start scan for delivered / veirifed packets
    const verifiedPackets = this.scanPacketVerifiedEvents(
      this.config.destinationEndpoint,
      this.config.startBlock - 1,
      async (packetDeliveredEvent) => {
        console.log(`Processing packet verified event...`);

        const dstEid = await this.config.destinationEndpoint.eid();
        const { guid } = deriveGuidFromPacketVerifiedEvent(
          dstEid,
          packetDeliveredEvent
        );

        // Check if packet is in sent packet store (which indicates the fee was also paid), if not wait
        while (!this.store.sentPacketStore[guid]) {
          console.log(
            `Waiting for packet with guid ${guid} to be sent from within verified packet event callback...`
          );
          await delay(this.config.delay);
        }

        if (!this.store.sentPacketStore[guid].paid) {
          console.log(
            `Packet with guid ${guid} was not paid for, no-op from within verified packet event callback...`
          );
          return;
        }

        // Finally, we can determine if we can execute the packet
        this.evaluatePacketEventsForExecution(
          this.store.sentPacketStore[guid].sentEvent,
          packetDeliveredEvent
        );
      }
    );

    // Return the last processed block for each scan function on interrupt
    return Promise.all([sentPackets, verifiedPackets]);
  }

  async stopExecutor() {
    console.log("Stopping executor...");
    this.running = false;
  }

  async queryFeePaid(
    packetSentEvent: PacketSentEventMessage
  ): Promise<bigint | null> {
    const txHash = packetSentEvent.transactionHash;

    const receipt =
      await this.config.sourceProvider.getTransactionReceipt(txHash);

    if (!receipt) {
      console.log(
        "Failed to retrieve transaction receipt from PacketSentEvent!"
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

      // TODO Additional logic to validate _our_ executor was paid.

      return decodedData[1] as bigint;
    } else {
      return null;
    }
  }

  async scanPacketSentEvents(
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

        if (sendPackets.length > 0) {
          console.log(
            `Found ${sendPackets.length} sent packets: ` +
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
        } else {
          console.log("No sent packets found within range");
        }
      } catch (error) {
        console.error("Error fetching packets:", error);
      }
    };

    console.log("Starting to scan for sent packets...");

    while (this.running) {
      await fetchSentPackets();
      await delay(this.config.delay);
    }

    return lastProcessedBlock;
  }

  async scanPacketVerifiedEvents(
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

        if (verifiedPackets.length > 0) {
          console.log(
            `Found ${verifiedPackets.length} verified packets: ` +
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
        } else {
          console.log("No verified packets found within range");
        }
      } catch (error) {
        console.error("Error fetching packets:", error);
      }
    };

    console.log("Starting to scan for delivered packets...");

    while (this.running) {
      await fetchVerifiedPackets();
      await delay(this.config.delay);
    }

    return lastProcessedBlock;
  }

  async evaluatePacketEventsForExecution(
    packetSentEvent: PacketSentEventMessage,
    packetVerifiedEvent: PacketVerifiedEventMessage
  ) {
    let executable: BigInt;
    const packet = PacketSerializer.deserialize(
      packetSentEvent.args.encodedPayload
    );
    const origin = packetVerifiedEvent.args.origin;

    while (true) {
      executable = await this.config.destinationEndpoint.executable(
        origin,
        packet.receiver
      );

      if (executable === BigInt(ExecutionState.Executable)) {
        console.log("Packet is executable");
        return true;
      }

      if (executable === BigInt(ExecutionState.Executed)) {
        console.log("Packet is already executed, no-op");
        return false;
      }

      await delay(this.config.delay);
    }
  }

  async executePacket(packet: Packet, options: Options): Promise<void> {
    const lzReceiverOptions = options.decodeExecutorLzReceiveOption();

    if (!lzReceiverOptions) {
      console.log("Packet does not contain executor options, no-op");
      return;
    }

    const origin = {
      srcEid: packet.srcEid,
      sender: packet.sender,
      nonce: packet.nonce,
    };
    
    // Build lzReceive transaction
    const tx =
      await this.config.destinationEndpoint.lzReceive.populateTransaction(
        origin,
        bytes32ToEthAddress(packet.receiver),
        hexZeroPadTo32(packet.guid),
        packet.message,
        "0x" // Extra data unsupported at this time
      );

    tx.gasLimit = lzReceiverOptions?.gas.toBigInt();
    tx.value = lzReceiverOptions?.value.toBigInt();

    // Send transaction on destination network
    const txResponse = await this.config.destinationWallet.sendTransaction(tx);
  }
}

export { Executor };
