
import { ethers } from "ethers";
import {
  ILayerZeroEndpointV2,
  ILayerZeroEndpointV2__factory,
} from "@lz/sdk";

export type ExecutorConfig = {
  sourceProvider: ethers.JsonRpcProvider;
  sourceEndpoint: ILayerZeroEndpointV2;
  destinationProvider: ethers.JsonRpcProvider;
  destinationEndpoint: ILayerZeroEndpointV2;
  destinationWallet: ethers.Wallet;
  delay: number;
  startBlock: number;
};

export const createConfigFromEnvironment = (): ExecutorConfig => {
    // Source network confgiuration
    const sourceProvider = new ethers.JsonRpcProvider(
      process.env.SRC_RPC_URL!
    );
    const sourceEndpointContractAddress =
      process.env.SRC_ENDPOINT_CONTRACT_ADDRESS!;
    const sourceEndpoint = ILayerZeroEndpointV2__factory.connect(
      sourceEndpointContractAddress,
      sourceProvider
    );

    // Destination network configuratino
    const destinationProvider = new ethers.JsonRpcProvider(
      process.env.DST_RPC_URL!
    );
    const destinationWallet = new ethers.Wallet(
      process.env.DST_PRIVATE_KEY!,
      destinationProvider
    );

    const destinationEndpointContractAddress =
      process.env.DST_ENDPOINT_CONTRACT_ADDRESS!;
    const destinationEndpoint = ILayerZeroEndpointV2__factory.connect(
      destinationEndpointContractAddress,
      destinationProvider
    );

    return {
      sourceProvider,
      sourceEndpoint,
      destinationProvider,
      destinationEndpoint,
      destinationWallet,
      delay: process.env.DELAY ? parseInt(process.env.DELAY) : 10000,
      startBlock: process.env.START_BLOCK
        ? parseInt(process.env.START_BLOCK)
        : 0,
    };
  }
