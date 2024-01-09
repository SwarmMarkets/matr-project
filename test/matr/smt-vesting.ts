import { ethers } from 'hardhat';
import { Signer } from 'ethers';
import { expect } from 'chai';

// import { createObjectCsvWriter } from 'csv-writer';
import csv from 'csv-parser';
import fsExtra from 'fs-extra';
import path from 'path';



import Reverter from '../utils/reverter';
import Time from '../utils/time';
import { MATR, VMATR } from '../../typechain-types';

let deployer: Signer;
let kakaroto: Signer;

let deployerAddress: string;
let kakarotoAddress: string;

let matrVesting: VMATR;
let matrVestingSecond: VMATR;
let matr: MATR;

const getData = (): Promise<any> => {
  const results: any[] = [];
  const myPromise = new Promise(resolve => {
    fsExtra
      .createReadStream(path.join(`data/vesting-schedule.csv`))
      .pipe(csv())
      .on('data', data => results.push(data))
      .on('end', () => {
        resolve(results);
      });
  });
  return myPromise;
};

let initialBlock: any;

describe('matrVesting contract', function () {
  const reverter = new Reverter();
  const time = new Time();

  before(async () => {
    [deployer, kakaroto] = await ethers.getSigners();
    [deployerAddress, kakarotoAddress] = await Promise.all([deployer.getAddress(), kakaroto.getAddress()]);

    const MATRVestingFactory = await ethers.getContractFactory('VMATR');

    matrVesting = (await MATRVestingFactory.deploy()) as VMATR;
    await matrVesting.deployed();

    initialBlock = (await matrVesting.initialBlock()).toNumber();

    matrVestingSecond = matrVesting.connect(kakaroto);

    const MATR = await ethers.getContractFactory('MATR');

    matr = (await MATR.deploy(matrVesting.address)) as MATR;
    await matr.deployed();

    await reverter.snapshot();
  });

  describe('setToken', () => {
    it('non owner should not be able to set token', async () => {
      await expect(matrVestingSecond.setToken(matr.address)).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('owner should not be able to set token as zero address', async () => {
      await expect(matrVesting.setToken(ethers.constants.AddressZero)).to.be.revertedWith('token is the zero address');
    });

    it('owner should be able to set token', async () => {
      await matrVesting.setToken(matr.address);
      expect(await matrVesting.token()).to.eq(matr.address);
    });

    it('owner should not be able to set token twice', async () => {
      await expect(matrVesting.setToken(kakarotoAddress)).to.be.revertedWith('token is already set');
    });
  });

  describe('vesting', async () => {
    let data: any[];

    before(async () => {
      data = await getData();
    });

    describe('accumulateAnualComBatch', async () => {
      it('should get the right value year after year ', async () => {
        for (let i = 0; i < data.length; i++) {
          const row = data[i];

          const isFirstYCBClaimed = i === 0 ? false : true;
          const blockNumber = initialBlock + 2102400 * i;
          const lastClaimedBlock = initialBlock + 2102399 * i;

          const accumulateAnualComBatch = await matrVesting.accumulateAnualComBatch(
            isFirstYCBClaimed,
            blockNumber,
            lastClaimedBlock,
          );

          expect(ethers.utils.formatUnits(accumulateAnualComBatch)).to.eq(row['AnualCommunityBatch']);
        }
      });

      it('should get the 0 when called for a year already claimed', async () => {
        for (let i = 0; i < data.length; i++) {
          const isFirstYCBClaimed = true;
          const blockNumber = 40320 + 2102400 * i;
          const lastClaimedBlock = 40319 + 2102400 * i;

          const accumulateAnualComBatch = await matrVesting.accumulateAnualComBatch(
            isFirstYCBClaimed,
            blockNumber,
            lastClaimedBlock,
          );

          expect(accumulateAnualComBatch).to.eq(0);
        }
      });

      it('should accumulate skiped years', async () => {
        let acc = ethers.utils.parseEther(data[1]['AnualCommunityBatch']);
        acc = acc.add(ethers.utils.parseEther(data[2]['AnualCommunityBatch']));
        acc = acc.add(ethers.utils.parseEther(data[3]['AnualCommunityBatch']));
        acc = acc.add(ethers.utils.parseEther(data[4]['AnualCommunityBatch']));
        acc = acc.add(ethers.utils.parseEther(data[5]['AnualCommunityBatch']));
        acc = acc.add(ethers.utils.parseEther(data[6]['AnualCommunityBatch']));
        acc = acc.add(ethers.utils.parseEther(data[7]['AnualCommunityBatch']));
        acc = acc.add(ethers.utils.parseEther(data[8]['AnualCommunityBatch']));

        const accumulateAnualComBatch = await matrVesting.accumulateAnualComBatch(
          true,
          2102400 * 8 + initialBlock,
          initialBlock,
        );

        expect(accumulateAnualComBatch).to.eq(acc);
      });
    });

    describe('accumulateCurrentYear', async () => {
      it('should get the right value week after week ', async () => {
        for (let y = 0; y < 5; y++) {
          const row = data[y];

          for (let w = 1; w < 53; w++) {
            const blockNumber = initialBlock + 2102400 * y + 40320 * w;
            const lastClaimedBlock = blockNumber - 40320;

            const accumulateCurrentYear = await matrVesting.accumulateCurrentYear(blockNumber, lastClaimedBlock);
            expect(ethers.utils.formatUnits(accumulateCurrentYear)).to.eq(row[`W${w}`]);
          }
        }
      });

      it('should get the right value week after week in the half of the week', async () => {
        for (let y = 0; y < 5; y++) {
          const row = data[y];

          for (let w = 1; w < 53; w++) {
            const blockNumber = initialBlock + 2102400 * y + 40320 * w - 20160;
            const lastClaimedBlock = y === 0 && w === 1 ? initialBlock : blockNumber - 40320;

            const accumulateCurrentYear = await matrVesting.accumulateCurrentYear(blockNumber, lastClaimedBlock);
            let expected = ethers.utils.parseEther(row[`W${w}`]).mul(20160).div(40320);

            expected =
              w === 1
                ? expected
                : expected.add(
                  ethers.utils
                    .parseEther(row[`W${w - 1}`])
                    .mul(20160)
                    .div(40320),
                );

            expect(accumulateCurrentYear).to.eq(expected);
          }
        }
      });
    });

    describe('accumulateFromPastYears', async () => {
      it('should get the right value accumulating from a past year', async () => {
        const blockNumber = initialBlock + 2102400 + 40320 * 2; //(Y2 W3)
        const lastClaimedBlock = initialBlock + 40320 * 2; // Y1 W2
        const accumulateFromPastYears = await matrVesting.accumulateFromPastYears(blockNumber, lastClaimedBlock);

        let acc = ethers.utils.parseEther(data[0]['W3']);
        for (let w = 4; w < 53; w++) {
          acc = acc.add(ethers.utils.parseEther(data[0][`W${w}`]));
        }
        acc = acc.add(ethers.utils.parseEther(data[1]['W1']));
        acc = acc.add(ethers.utils.parseEther(data[1]['W2']));

        expect(accumulateFromPastYears).to.eq(acc);
      });

      it('should get the right value accumulating from a past year half of week', async () => {
        const blockNumber = initialBlock + 2102400 + 40320 * 2 + 20160; //(Y2 W3)
        const lastClaimedBlock = initialBlock + 40320 * 2 + 20160; // Y1 W2
        const accumulateFromPastYears = await matrVesting.accumulateFromPastYears(blockNumber, lastClaimedBlock);

        let acc = ethers.utils.parseEther(data[0]['W3']).mul(20160).div(40320);
        for (let w = 4; w < 53; w++) {
          acc = acc.add(ethers.utils.parseEther(data[0][`W${w}`]));
        }
        acc = acc.add(ethers.utils.parseEther(data[1]['W1']));
        acc = acc.add(ethers.utils.parseEther(data[1]['W2']));
        acc = acc.add(ethers.utils.parseEther(data[1]['W3']).mul(20160).div(40320));

        expect(accumulateFromPastYears).to.eq(acc);
      });
    });

    describe('claimableAmount', async () => {
      it('should get the right value week after week ', async () => {
        let lastClaimedBlock = initialBlock;
        let firstYCBClaimed = false;
        for (let y = 0; y < 5; y++) {
          const row = data[y];

          for (let w = 0; w < 52; w++) {
            const blockNumber = initialBlock + 2102400 * y + 40320 * w;

            const accumulateCurrentYear = await matrVesting['claimableAmount(bool,uint256,uint256)'](
              firstYCBClaimed,
              blockNumber,
              lastClaimedBlock,
            );

            let amount = ethers.BigNumber.from(0);
            if (w === 0) {
              amount = amount.add(ethers.utils.parseEther(row['AnualCommunityBatch']));
              if (y !== 0) {
                amount = amount.add(ethers.utils.parseEther(data[y - 1]['W52']));
              }
            } else {
              amount = ethers.utils.parseEther(row[`W${w}`]);
            }

            expect(accumulateCurrentYear).to.eq(amount);

            // this imitates what a claim would do
            firstYCBClaimed = true;
            lastClaimedBlock = blockNumber;
          }
        }
      });

      it('should get the right value with some weeks in between claim', async () => {
        let lastClaimedBlock = initialBlock;
        let firstYCBClaimed = false;
        for (let y = 0; y < 10; y++) {
          const row = data[y];
          for (let w = 0; w < 52; w += 4) {
            const blockNumber = initialBlock + 2102400 * y + 40320 * w;

            const accumulateCurrentYear = await matrVesting['claimableAmount(bool,uint256,uint256)'](
              firstYCBClaimed,
              blockNumber,
              lastClaimedBlock,
            );

            let amount = ethers.BigNumber.from(0);
            if (w === 0) {
              amount = amount.add(ethers.utils.parseEther(row['AnualCommunityBatch']));
              if (y !== 0) {
                amount = amount.add(ethers.utils.parseEther(data[y - 1]['W49']));
                amount = amount.add(ethers.utils.parseEther(data[y - 1]['W50']));
                amount = amount.add(ethers.utils.parseEther(data[y - 1]['W51']));
                amount = amount.add(ethers.utils.parseEther(data[y - 1]['W52']));
              }
            } else {
              amount = ethers.utils.parseEther(row[`W${w}`]);
              amount = amount.add(ethers.utils.parseEther(row[`W${w - 1}`]));
              amount = amount.add(ethers.utils.parseEther(row[`W${w - 2}`]));
              amount = amount.add(ethers.utils.parseEther(row[`W${w - 3}`]));
            }

            expect(accumulateCurrentYear).to.eq(amount);

            // this imitates what a claim would do
            firstYCBClaimed = true;
            lastClaimedBlock = blockNumber;
          }
        }
      });
    });

    describe('claim', () => {
      before(async () => {
        await reverter.revert();

        await matrVesting.setToken(matr.address);

        await reverter.snapshot();
      });

      beforeEach(async () => {
        await reverter.revert();
      });

      it('should get the right value week after week ', async () => {
        for (let y = 0; y < 5; y++) {
          const row = data[y];

          for (let w = 0; w < 52; w++) {
            const blockNumber = initialBlock + 2102400 * y + 40320 * w;

            const initialVetingBalance = await matr.balanceOf(matrVesting.address);
            const initialOwnerBalance = await matr.balanceOf(deployerAddress);

            await matrVesting['claim(uint256)'](blockNumber);

            let amount = ethers.BigNumber.from(0);
            if (w === 0) {
              amount = amount.add(ethers.utils.parseEther(row['AnualCommunityBatch']));
              if (y !== 0) {
                amount = amount.add(ethers.utils.parseEther(data[y - 1]['W52']));
              }
            } else {
              amount = ethers.utils.parseEther(row[`W${w}`]);
            }

            expect(await matr.balanceOf(matrVesting.address)).to.eq(initialVetingBalance.sub(amount));
            expect(await matr.balanceOf(deployerAddress)).to.eq(initialOwnerBalance.add(amount));

            expect(await matrVesting.lastClaimedBlock()).to.eq(blockNumber);
            expect(await matrVesting.firstYCBClaimed()).to.eq(true);
          }
        }
      });

      it('should get the right value with some weeks in between claim', async () => {
        for (let y = 0; y < 10; y++) {
          const row = data[y];
          for (let w = 0; w < 52; w += 4) {
            const blockNumber = initialBlock + 2102400 * y + 40320 * w;

            const initialVetingBalance = await matr.balanceOf(matrVesting.address);
            const initialOwnerBalance = await matr.balanceOf(deployerAddress);

            await matrVesting['claim(uint256)'](blockNumber);

            let amount = ethers.BigNumber.from(0);
            if (w === 0) {
              amount = amount.add(ethers.utils.parseEther(row['AnualCommunityBatch']));
              if (y !== 0) {
                amount = amount.add(ethers.utils.parseEther(data[y - 1]['W49']));
                amount = amount.add(ethers.utils.parseEther(data[y - 1]['W50']));
                amount = amount.add(ethers.utils.parseEther(data[y - 1]['W51']));
                amount = amount.add(ethers.utils.parseEther(data[y - 1]['W52']));
              }
            } else {
              amount = ethers.utils.parseEther(row[`W${w}`]);
              amount = amount.add(ethers.utils.parseEther(row[`W${w - 1}`]));
              amount = amount.add(ethers.utils.parseEther(row[`W${w - 2}`]));
              amount = amount.add(ethers.utils.parseEther(row[`W${w - 3}`]));
            }

            expect(await matr.balanceOf(matrVesting.address)).to.eq(initialVetingBalance.sub(amount));
            expect(await matr.balanceOf(deployerAddress)).to.eq(initialOwnerBalance.add(amount));

            expect(await matrVesting.lastClaimedBlock()).to.eq(blockNumber);
            expect(await matrVesting.firstYCBClaimed()).to.eq(true);
          }
        }
      });

      it('should claim some amount and transfer to the owner', async () => {
        await time.advanceBlockTo(20160);
        // const claimableAmount = await matrVesting['claimableAmount()']()
        const initialVetingBalance = await matr.balanceOf(matrVesting.address);
        const initialOwnerBalance = await matr.balanceOf(deployerAddress);

        expect(await matrVesting.lastClaimedBlock()).to.eq(initialBlock);
        expect(await matrVesting.firstYCBClaimed()).to.eq(false);

        const receipt = await (await matrVesting['claim()']()).wait();

        const claimEvent = receipt.events?.find((log: any) => log.event && log.event === 'Claim');
        const amount = (claimEvent && claimEvent.args ? claimEvent.args.amount : '') as string;

        expect(await matr.balanceOf(matrVesting.address)).to.eq(initialVetingBalance.sub(amount));
        expect(await matr.balanceOf(deployerAddress)).to.eq(initialOwnerBalance.add(amount));

        expect(await matrVesting.lastClaimedBlock()).to.eq(20161);
        expect(await matrVesting.firstYCBClaimed()).to.eq(true);
      });
    });
  });