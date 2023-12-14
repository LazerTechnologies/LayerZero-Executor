import { deployFunction } from '../../deploy/00_Deploy_LayerZero'
import { EndpointV2__factory } from '../../src/typechain'
import { SendUln302__factory } from '../../src/typechain'

import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { encodeBytes32String } from 'ethers'
import hre from 'hardhat'
import { createProvider } from 'hardhat/internal/core/providers/construction'

chai.use(chaiAsPromised)
const { expect } = chai

const expectError = async (
  f: () => Promise<unknown>,
  errorStringFilter: string,
  failReason: string,
) => {
  try {
    await f()
    expect.fail(failReason)
  } catch (e: any) {
    if (e.toString().indexOf(errorStringFilter) === -1) {
      expect.fail(
        `This should have thrown a different error. Got: ${e.message}`,
      )
    }
  }
}

type Contracts = {
  localContracts: Awaited<ReturnType<typeof deployFunction>>['local'],
  remoteContracts: Awaited<ReturnType<typeof deployFunction>>['remote']
}

describe('LayerZero - EndpointV2', () => {
  let { localContracts, remoteContracts }: Contracts = {} as Contracts
  beforeEach(async () => {
    const remoteProvider = await createProvider(hre.config, 'localhost', hre.artifacts)
    await remoteProvider.send('hardhat_reset', [])
    await hre.network.provider.send('hardhat_reset', [])
    const deploymentResult = await deployFunction(hre)
    localContracts = deploymentResult.local
    remoteContracts = deploymentResult.remote
  })

  describe('main', () => {
    it('should work', async () => {
      console.log({ localContractsEId: localContracts.eid, remoteContractsEId: remoteContracts.eid })

      const options = await localContracts.omniCounter.getTestArgs()
     
      // console.log('options [len:%d]:', ethers.toBeArray(options).byteLength, options)

      const price = await localContracts.omniCounter.quote(remoteContracts.eid, 3, options)

      console.log('price:', price)

      const incrementTx = await localContracts.omniCounter.increment(remoteContracts.eid, 3, options, { value: price[0] + price[1] })
      const receipt = await incrementTx.wait()

      console.log('receipt:', receipt?.logs)
      console.log('ENDPOINT LOGS:', receipt?.logs.map((log: any) => EndpointV2__factory.createInterface().parseLog({ data: log.data, topics: log.topics as string[] })))
      console.log('SEND LIBRARY LOGS:', receipt?.logs.map((log: any) => SendUln302__factory.createInterface().parseLog({ data: log.data, topics: log.topics as string[] })))
    })
  })
})