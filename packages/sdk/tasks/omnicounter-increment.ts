import { task } from 'hardhat/config'
import { HardhatEthersProvider } from '@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { EndpointId } from '@lz/lz-definitions'
import { OmniCounter__factory } from '../src/typechain'

const OMNI_COUNTER_ADDRESS = '0x95bD8D42f30351685e96C62EDdc0d0613bf9a87A'

task('omnicounter:increment', "Calls `increment(dstEid)` on the local OmniCounter oApp instance")
  .setAction(async (taskArgs, hre): Promise<void> => {
    const namedAccounts = await hre.getNamedAccounts()
    const namedSigners: { [key: string]: HardhatEthersSigner } = {}
    const provider = new HardhatEthersProvider(hre.network.provider, hre.network.name)
    for (const [accountName, accountAddress] of Object.entries(namedAccounts)) {
      const signer = await HardhatEthersSigner.create(provider, accountAddress)
      namedSigners[accountName] = signer
    }
    const { oAppOwner } = namedSigners

    const omniCounter = OmniCounter__factory.connect(OMNI_COUNTER_ADDRESS, oAppOwner)
    const options = await omniCounter.getTestArgs()
    const args = [EndpointId.POLYGON_V2_SANDBOX, 3, options] as const
    console.log('quoting...', args)
    const price = await omniCounter.quote(...args)
    console.log('price:', price)
    await (await omniCounter.increment(...args, { value: price[0] + price[1] })).wait()
  })
