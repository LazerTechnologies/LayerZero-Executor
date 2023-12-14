import { task } from 'hardhat/config'

task('reset:local', "Resets a local node by url")
  .setAction(async (taskArgs, hre): Promise<void> => {
    await hre.network.provider.send('hardhat_reset', [])
  })
