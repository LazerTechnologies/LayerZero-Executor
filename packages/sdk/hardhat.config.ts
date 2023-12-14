import  * as glob from "glob"
import path from "path"

import "hardhat-deploy";
import 'dotenv/config'
import '@nomicfoundation/hardhat-toolbox'
import "@nomicfoundation/hardhat-ethers";
import '@nomicfoundation/hardhat-chai-matchers'

import * as dotenv from 'dotenv'
import { subtask, type HardhatUserConfig } from 'hardhat/config'

dotenv.config()

import './tasks'

import { TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS } from "hardhat/builtin-tasks/task-names"

subtask(TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS).setAction(async (_, hre, runSuper) => {
  const paths = await runSuper();
  const otherDirectoryGlob = path.join(hre.config.paths.root, "packages", "sdk", "contracts", "**", "contracts", "**", "*.sol");
  const otherPaths = glob.sync(otherDirectoryGlob);
  const allPaths = [...paths, ...otherPaths].filter((p: string) => !p.includes('node_modules'))
  return allPaths
})

const config: HardhatUserConfig = {
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {
      chainId: 1,
    },
    src: {
      chainId: 31337,
      url: 'http://localhost:8548',
    },
    dst: {
      chainId: 31337,
      url: 'http://localhost:8549',
    },
  },
  namedAccounts: {
    layerzero: {
      default: 0,
    },
    signer1: {
      default: 1,
    },
    signer2: {
      default: 2,
    },
    admin1: {
      default: 3,
    },
    verifier: {
      default: 4,
    },
    verifierAdmin: {
      default: 5,
    },
    executorRoleAdmin: {
      default: 6,
    },
    executorAdmin: {
      default: 7,
    },
    oAppOwner: {
      default: 8
    }
  },
  solidity: {
    compilers: [
      {
        version: '0.8.22',
        settings: {
          optimizer: {
            enabled: true,
            runs: 5000,
          },
          viaIR: true,
        }
      },
    ],
  },
  typechain: {
    outDir: './src/typechain',
    target: 'ethers-v6',
    dontOverrideCompile: false,
  },
}

export default config
