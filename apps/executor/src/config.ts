import { ethers } from "ethers";
import { ILayerZeroEndpointV2__factory } from "@lz/sdk";
import { ExecutorConfig, Network, NetworkConfig, NetworkConfigJson, Networks } from "./types";

export const createNetworksFromJsonString = (
  jsonString: string
): Networks => {
  let networks: Networks = {};
  const configJson = JSON.parse(jsonString) as NetworkConfigJson;

  for (const networkId in configJson) {
    const provider = new ethers.JsonRpcProvider(configJson[networkId].rpcUrl);

    const endpoint = ILayerZeroEndpointV2__factory.connect(
      configJson[networkId].endpointContractAddress,
      provider
    );

    const wallet = new ethers.Wallet(configJson[networkId].privateKey, provider);

    networks[networkId] = {
      provider,
      endpoint,
      wallet,
    };
  }

  return networks;
};

export const createConfigFromEnvironment = (): ExecutorConfig => {
  return {
    networks: createNetworksFromJsonString(process.env.NETWORKS!),
    delay: process.env.DELAY ? parseInt(process.env.DELAY) : 10000,
    startBlock: process.env.START_BLOCK
      ? parseInt(process.env.START_BLOCK)
      : 0,
  };
}
