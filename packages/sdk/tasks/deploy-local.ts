import { EndpointId } from '@lz/lz-definitions'
import { task } from 'hardhat/config'
import { deployToNetwork } from '../deploy/00_Deploy_LayerZero'

task('deploy:local', "Deploys the ecosystem to a local node by url")
  .addFlag('dst', 'If you want this deploy the destination side.')
  .setAction(async (taskArgs, hre): Promise<void> => {
    const localEid = EndpointId.ETHEREUM_V2_SANDBOX
    const remoteNetworkEid = EndpointId.POLYGON_V2_SANDBOX
    await deployToNetwork('localhost', hre, hre.network.provider, taskArgs.dst ? { localEid: remoteNetworkEid, remoteEid: localEid } : { localEid, remoteEid: remoteNetworkEid })
  })
