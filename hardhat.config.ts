/* eslint-disable */
import '@nomicfoundation/hardhat-toolbox';
import dotenv from 'dotenv';
import { HardhatUserConfig } from 'hardhat/config';
dotenv.config();

// Ensure that we have all the environment variables we need.
const mnemonic = process.env.MNEMONIC ?? '';
const privateKey = process.env.PK ?? '';

const etherscanKey = process.env.ETHSCAN_KEY ?? '';
const polyscanKey = process.env.POLYSCAN_KEY ?? '';

const infuraKey = process.env.INFURA_KEY ?? '';
const ethApiKey = process.env.ALCHEMY_KEY_ETH ?? infuraKey;
const sepoliaApiKey = process.env.ALCHEMY_KEY_SEPOLIA ?? infuraKey;
const polygonApiKey = process.env.ALCHEMY_KEY_POLYGON ?? infuraKey;
const mumbaiApiKey = process.env.ALCHEMY_KEY_MUMBAI ?? infuraKey;

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.19",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {
      blockGasLimit: 20000000,
      throwOnCallFailures: false,
      chainId: 31337,
      initialBaseFeePerGas: 0,
      accounts: {
        mnemonic,
        accountsBalance: "10000000000000000000000000",
      },
      forking: {
        url: `https://eth-mainnet.alchemyapi.io/v2/${ethApiKey}`,
        enabled: true,
        //blockNumber: 16383055,
      },
    },
    mainnet: {
      url: `https://eth-mainnet.alchemyapi.io/v2/${ethApiKey}`,
      chainId: 1,
      accounts: { mnemonic },
      gas: 2100000,
      gasPrice: 60000000000, // 45
    },
    sepolia: {
      url: `https://eth-sepolia.g.alchemy.com/v2/${sepoliaApiKey}`,
      chainId: 11155111,
      accounts: [privateKey],
      gas: 2100000,
      gasPrice: 45000000000, // 45
    },
    polygon: {
      url: `https://polygon-mainnet.g.alchemy.com/v2/${polygonApiKey}`,
      chainId: 137,
      accounts: { mnemonic },
      gas: 5000000,
      gasPrice: 250000000000, // 250
    },
    mumbai: {
      url: `https://polygon-mumbai.g.alchemy.com/v2/${mumbaiApiKey}`,
      chainId: 80001,
      accounts: [privateKey],
      gas: 2100000,
      gasPrice: 45000000000, // 45
      gasMultiplier: 2,
    },
  },
  gasReporter: {
    coinmarketcap: process.env.COIN_MARKET_CAP_KEY,
    currency: 'USD',
    enabled: process.env.REPORT_GAS ? true : false,
    excludeContracts: ['mocks/', 'test/'],
  },
  etherscan: {
    apiKey: {
      mainnet: etherscanKey,
      polygon: polyscanKey,
    },
  },
  paths: {
    artifacts: './artifacts',
    cache: './cache',
    sources: './contracts',
    tests: './test',
  },
  typechain: {
    outDir: 'typechain',
    target: 'ethers-v5',
  },
};

export default config;
