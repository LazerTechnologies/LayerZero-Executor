import type { DeployFunction } from 'hardhat-deploy/types'
import { BigNumber } from '@ethersproject/bignumber'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { ethers } from 'ethers'
import { EthereumProvider, HardhatRuntimeEnvironment } from 'hardhat/types'
import { HardhatEthersProvider } from '@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider'
import { createProvider } from 'hardhat/internal/core/providers/construction'
import { EndpointId } from '@lz/lz-definitions'

export const deployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const localNetwork = hre.network
  const remoteProvider = await createProvider(hre.config, 'localhost', hre.artifacts)
  const localEid = EndpointId.ETHEREUM_V2_SANDBOX
  const remoteNetworkEid = EndpointId.POLYGON_V2_SANDBOX
 
  const localNetworkInterface = await deployToNetwork(localNetwork.name, hre, localNetwork.provider, { localEid, remoteEid: remoteNetworkEid })
  const remoteNetworkInterface = await deployToNetwork('localhost', hre, remoteProvider, { localEid: remoteNetworkEid, remoteEid: localEid })

  return { local: localNetworkInterface, remote: { eid: remoteNetworkEid } }
}

const defaultDeployFunction: DeployFunction = async (hre) => {
  deployFunction(hre)
}

export const deployToNetwork = async (
    name: string,
    hre: HardhatRuntimeEnvironment,
    provider: EthereumProvider,
    { localEid, remoteEid }: {localEid: number, remoteEid: number },
  ) => {
    const namedAccounts = await hre.getNamedAccounts()
    const namedSigners: { [key: string]: HardhatEthersSigner } = {}
    for (const [accountName, accountAddress] of Object.entries(namedAccounts)) {
      const signer = await HardhatEthersSigner.create(new HardhatEthersProvider(provider, name), accountAddress)
      namedSigners[accountName] = signer
    }
    const { layerzero, executorRoleAdmin, executorAdmin, verifier, verifierAdmin, signer1, signer2, admin1, oAppOwner } = namedSigners

    // deploy EnvpointV2
    const endpointV2Factory = await hre.ethers.getContractFactory('EndpointV2', layerzero)
    const endpoint = await (await endpointV2Factory.deploy(localEid)).waitForDeployment()
    const endpointAddress = await endpoint.getAddress()

    // deploy SimpleMessageLib
    // const simpleMessageLibFactory = await hre.ethers.getContractFactory('SimpleMessageLib', layerzero)
    // const simpleMessageLib = await (await (simpleMessageLibFactory.deploy(endpointAddress, layerzero.address))).waitForDeployment()
    // const simpleMessageLibAddress = await simpleMessageLib.getAddress()
    // await endpoint.connect(layerzero).registerLibrary(simpleMessageLibAddress)

    // deploy PriceFeed
    const priceFeedFactory = await hre.ethers.getContractFactory('PriceFeed', layerzero)
    const priceFeed = await (await (priceFeedFactory.deploy())).waitForDeployment()
    await priceFeed.initialize(ethers.ZeroAddress)
    const priceFeedAddress = await priceFeed.getAddress()
  
    // configure PriceFeed
    await priceFeed.setEndpoint(endpointAddress)
    await priceFeed.setPrice([
      {
        eid: localEid,
        price: {
          priceRatio: BigNumber.from('100000000000000000000').toString(),
          gasPriceInUnit: BigNumber.from(100000000).toString(),
          gasPerByte: 1,
        }
      }
    ])
    await priceFeed.setPriceRatioDenominator(BigNumber.from(10).pow(20).toString())
  
    // deploy send library
    const sendUln302Factory = await hre.ethers.getContractFactory('SendUln302', layerzero)
    const sendLibrary = await (await (sendUln302Factory.deploy(endpointAddress, 0, 0))).waitForDeployment()
    await sendLibrary.setTreasury(layerzero)
    const sendLibraryAddress = await sendLibrary.getAddress()
  
    // deploy receive library
    const receiveUln302Factory = await hre.ethers.getContractFactory('ReceiveUln302', layerzero)
    const receiveLibrary = await (await (receiveUln302Factory.deploy(endpointAddress))).waitForDeployment()
    const receiveLibraryAddress = await receiveLibrary.getAddress()
    
    // register send and receive libraries
    await endpoint.connect(layerzero).registerLibrary(sendLibraryAddress)
    await endpoint.connect(layerzero).registerLibrary(receiveLibraryAddress)

    // deploy verifier
    const dvnFactory = await hre.ethers.getContractFactory('DVN', layerzero)
    const dvn = await (await (dvnFactory.deploy(localEid % 30_000, [sendLibrary, receiveLibrary], priceFeedAddress, [signer2, signer1], 1, [verifierAdmin]))).waitForDeployment()
    const dvnAddress = await dvn.getAddress()
  
    // deploy executor fee library
    const executorFeeLibFactory = await hre.ethers.getContractFactory('ExecutorFeeLib', layerzero)
    const executorFeeLib = await (await (executorFeeLibFactory.deploy(0))).waitForDeployment()
    const executorFeeLibAddress = await executorFeeLib.getAddress()
    
    // deploy executor
    const executorFactory = await hre.ethers.getContractFactory('Executor', layerzero)
    const executor = await (await (executorFactory.deploy())).waitForDeployment()
    const executorAddress = await executor.getAddress()
  
    // config executor
    await executor.initialize(endpointAddress, [sendLibrary, receiveLibrary], priceFeedAddress, executorRoleAdmin, [executorAdmin])
    await executor.connect(executorAdmin).setWorkerFeeLib(executorFeeLibAddress)
    await executor.connect(executorAdmin).setDefaultMultiplierBps(12000)
    await executor.connect(executorRoleAdmin).grantRole(ethers.keccak256(ethers.toUtf8Bytes('MESSAGE_LIB_ROLE')), sendLibraryAddress)

    await executor.connect(executorAdmin).setDstConfig([{
      dstEid: remoteEid,
      nativeDropCap: ethers.parseUnits('800'),
      baseGas: 120000,
      multiplierBps: 12000,
      floorMarginUSD: ethers.parseUnits('0.01', 20).toString(),
    }])
  
    // deploy DVN fee library
    const dvnFeeLibFactory = await hre.ethers.getContractFactory('DVNFeeLib', layerzero)
    const dvnFeeLib = await (await (dvnFeeLibFactory.deploy(0))).waitForDeployment()
    const dvnFeeLibAddress = await dvnFeeLib.getAddress()
  
    // config verifier
    await dvn.connect(verifierAdmin).setWorkerFeeLib(dvnFeeLibAddress)
    await dvn.connect(verifierAdmin).setDefaultMultiplierBps(12000)
    await dvn.connect(verifierAdmin).grantRole(ethers.keccak256(ethers.toUtf8Bytes('ADMIN_ROLE')), layerzero)
  
    // configure send library
    await sendLibrary.setDefaultUlnConfigs([{
      config: { confirmations: 1, optionalDVNCount: 1, optionalDVNs: [dvnAddress], requiredDVNCount: 1, requiredDVNs: [dvnAddress], optionalDVNThreshold: 1 },
      eid: remoteEid,
    }])
  
    await sendLibrary.setDefaultExecutorConfigs([{
      config: { executor: executorAddress, maxMessageSize: 10000 },
      eid: remoteEid,
    }])
  
    // configure receive library
    await receiveLibrary.setDefaultUlnConfigs([{
      config: { confirmations: 1, optionalDVNCount: 0, optionalDVNs: [], requiredDVNCount: 1, requiredDVNs: [dvnAddress], optionalDVNThreshold: 0 },
      eid: remoteEid,
    }])
  
    // configure endpoint with message libraries
    await endpoint.connect(layerzero).setDefaultSendLibrary(remoteEid, sendLibraryAddress)
    await endpoint.connect(layerzero).setDefaultReceiveLibrary(remoteEid, receiveLibraryAddress, 0)
    
    // deploy application
    const omniCounterFactory = await hre.ethers.getContractFactory('OmniCounter', oAppOwner)
    const omniCounter = await (await omniCounterFactory.deploy(endpointAddress)).waitForDeployment()
    const omniCounterAddress = await omniCounter.getAddress()
    await omniCounter.setPeer(remoteEid, ethers.zeroPadValue(omniCounterAddress, 32))
    
    // const configPayload = endpointIFace.encodeFunctionData('setConfig', args)

    // set the send library
    await omniCounter.callEndpoint(
      endpointV2Factory.interface.encodeFunctionData('setSendLibrary', [
        remoteEid,
        sendLibraryAddress,
      ])
    )

    // set the receive library
    await omniCounter.callEndpoint(
      endpointV2Factory.interface.encodeFunctionData('setReceiveLibrary', [
        remoteEid,
        receiveLibraryAddress,
        0,
      ])
    )

    // set executor settings on the send library
    await omniCounter.callEndpoint(
      endpointV2Factory.interface.encodeFunctionData('setConfig', [
        sendLibraryAddress,
        [{
          eid: remoteEid,
          configType: 1,
          config: ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "address"], [10000, executorAddress])
        }]
      ])
    )

    // set Uln settings on the send library
    await omniCounter.callEndpoint(
      endpointV2Factory.interface.encodeFunctionData('setConfig', [
        sendLibraryAddress,
        [{
          eid: remoteEid,
          configType: 2,
          config: ethers.AbiCoder.defaultAbiCoder().encode(
            ['uint64', 'uint8', 'uint8', 'uint8', 'address[]', 'address[]'],
            [0, 1, 0, 0, [dvnAddress], []]
          )
        }]
      ])
    )

    // set Uln settings on the receive library
    await omniCounter.callEndpoint(
      endpointV2Factory.interface.encodeFunctionData('setConfig', [
        receiveLibraryAddress,
        [{
          eid: remoteEid,
          configType: 2,
          config: ethers.AbiCoder.defaultAbiCoder().encode(
            ['uint64', 'uint8', 'uint8', 'uint8', 'address[]', 'address[]'],
            [0, 1, 0, 0, [dvnAddress], []]
          )
        }]
      ])
    )

    // const omniCounterPreCrimeFactory = await hre.ethers.getContractFactory('OmniCounterPreCrime', oAppOwner)
    // const omniCounterPreCrime = await (await omniCounterPreCrimeFactory.deploy(endpointAddress, omniCounter)).waitForDeployment()
    // const omniCounterPreCrimeAddress = await omniCounterPreCrime.getAddress()
    // await omniCounterPreCrime.setMaxBatchSize(10)
    // // await omniCounterPreCrime.setPreCrimePeers()
    // await omniCounter.setPreCrime(omniCounterPreCrimeAddress)
    // const messageLibConfigPayload = [
    //   {
    //     eid: remoteEid,
    //     configType: 2,
    //     config: ethers.AbiCoder.defaultAbiCoder().encode(
    //       ['uint64', 'uint8', 'uint8', 'uint8', 'address[]', 'address[]'],
    //       ['18446744073709551615', 255, 255, 0, [dvnAddress], []]
    //     )
    //   }
    // ]

    return {
      endpoint,
      priceFeed,
      sendLibrary,
      receiveLibrary,
      omniCounter,
      executor,
      executorFeeLib,
      dvn,
      dvnFeeLib,
      eid: localEid,
      name,
    }
}

export default defaultDeployFunction
