const TeaToken = artifacts.require('TeaToken.sol');
const SeedSwap = artifacts.require('SeedSwap.sol');
const MockTestSeedSwap = artifacts.require('MockTestSeedSwap.sol');

const BN = web3.utils.BN;

const Helper = require('../helper');
const { ethAddress, zeroAddress, ethDecimals, precisionUnits} = require('../helper');
const {expectRevert, expectEvent} = require('@openzeppelin/test-helpers');

let teaToken;
let seedSwap;
let deployer;
let admin;
let owner;
let user;
let ethAmount = new BN(10).pow(new BN(15));

contract('SeedSwap', accounts => {
  describe('test some simple trades', async () => {
    before('test trade in uniswap curve', async () => {
      deployer = accounts[0];
      admin = accounts[1];
      owner = accounts[2];
      user = accounts[3];
      teaToken = await TeaToken.new(owner);
      seedSwap = await SeedSwap.new(owner, teaToken.address, { from: deployer });
    });

    describe(`Constructor`, async() => {
      it(`Test data correct after deployed`, async() => {
        seedSwap = await SeedSwap.new(owner, teaToken.address, { from: deployer });
        Helper.assertEqual(teaToken.address, await seedSwap.saleToken());
        Helper.assertEqual(owner, await seedSwap.owner());
        Helper.assertEqual(true, await seedSwap.isWhitelistAdmin(owner));
        // deployer is also an admin
        Helper.assertEqual(true, await seedSwap.isWhitelistAdmin(deployer));
        Helper.assertEqual(owner, await seedSwap.ethRecipient());
        Helper.assertEqual(false, await seedSwap.isPaused());
      });

      it(`Test invalid constructor params`, async() => {
        await expectRevert(
          SeedSwap.new(owner, zeroAddress, { from: deployer }),
            "constructor: invalid token"
        );
      });
    });

    describe(`Invalid swap`, async() => {
      beforeEach(`Init contracts for each test`, async() => {
        let currentTime = new BN(await Helper.getCurrentBlockTime());
        seedSwap = await MockTestSeedSwap.new(
          owner,
          teaToken.address,
          currentTime.add(new BN(20)),  // start
          currentTime.add(new BN(60)), // end
          new BN(10).pow(new BN(16)),   // hard cap
          new BN(10).pow(new BN(18)),   // user's cap
          { from: deployer }
        );
        // add all users as whitelisted
        await seedSwap.updateWhitelistedUsers(accounts, true, { from: owner });
      });

      const expectRevertWithMessage = async function(user, amount, errorMessage) {
        await expectRevert(
          seedSwap.swapEthToToken({ from: user, value: amount }),
          errorMessage
        );
        await expectRevert(
          Helper.sendEtherWithPromise(user, seedSwap.address, amount),
          errorMessage
        );
      }

      const delayToStartTime = async() => {
        // delay to start time
        let currentTime = await Helper.getCurrentBlockTime();
        let duration = (await seedSwap.saleStartTime()) * 1 - currentTime;
        await Helper.mineNewBlockAfter(duration);
      }

      it(`Test positive amount`, async() => {
        await expectRevertWithMessage(user, new BN(0), "onlyCanSwap: amount is 0");
      });

      it(`Test sale has not started`, async() => {
        await expectRevertWithMessage(user, ethAmount, "onlyCanSwap: not started yet");
      });

      it(`Test sale already ended`, async() => {
        let currentTime = await Helper.getCurrentBlockTime();
        let duration = (await seedSwap.saleEndTime()) * 1 - currentTime;
        await Helper.mineNewBlockAfter(duration);
        await expectRevertWithMessage(user, ethAmount, "onlyCanSwap: already ended");
      });

      it(`Test hardcap reached`, async() => {
        await delayToStartTime();
        let hardCap = await seedSwap.HARD_CAP();
        await seedSwap.swapEthToToken({ value: hardCap, from: owner });
        await expectRevertWithMessage(owner, ethAmount, "onlyCanSwap: HARD_CAP reached");
      });

      it(`Test min/max user's cap`, async() => {
        await delayToStartTime();
        let minCap = await seedSwap.MIN_INDIVIDUAL_CAP();
        await expectRevertWithMessage(owner, minCap.sub(new BN(1)), "onlyCanSwap: eth amount must be within individual cap");
        let maxCap = await seedSwap.MAX_INDIVIDUAL_CAP();
        await expectRevertWithMessage(owner, maxCap.add(new BN(1)), "onlyCanSwap: eth amount must be within individual cap");
        // check total swap is more than user's max cap
        let currentTime = new BN(await Helper.getCurrentBlockTime());
        seedSwap = await MockTestSeedSwap.new(
          owner,
          teaToken.address,
          currentTime.add(new BN(20)),  // start
          currentTime.add(new BN(60)), // end
          ethAmount.mul(new BN(2)),   // hard cap
          ethAmount,   // user's cap
          { from: deployer }
        );
        await seedSwap.updateWhitelistedUsers(accounts, true, { from: owner });
        await delayToStartTime();
        await seedSwap.swapEthToToken({ from: user, value: ethAmount });
        await expectRevertWithMessage(user, ethAmount, "capSwap: max individual cap reached");
        // other user still can swap
        await seedSwap.swapEthToToken({ from: owner, value: ethAmount });
      });

      it(`Test whitelisted sender`, async() => {
        await delayToStartTime();
        // remove user from whitelisted address
        await seedSwap.updateWhitelistedUsers([user], false, { from: owner });
        await expectRevertWithMessage(user, ethAmount, "onlyCanSwap: sender is not whitelisted");
      });

      it(`Test whitelisted sender`, async() => {
        await delayToStartTime();
        // remove user from whitelisted address
        await seedSwap.updateWhitelistedUsers([user], false, { from: owner });
        await expectRevertWithMessage(user, ethAmount, "onlyCanSwap: sender is not whitelisted");
      });

      it(`Test not enough token when hardcap reached`, async() => {
        let currentTime = new BN(await Helper.getCurrentBlockTime());
        seedSwap = await MockTestSeedSwap.new(
          owner,
          teaToken.address,
          currentTime.add(new BN(20)),  // start
          currentTime.add(new BN(60)), // end
          ethAmount,   // hard cap
          ethAmount.mul(new BN(2)),   // user's cap
          { from: deployer }
        );
        await seedSwap.updateWhitelistedUsers(accounts, true, { from: owner });
        await delayToStartTime();
        let tokenAmount = ethAmount.mul((await seedSwap.saleRate())).mul(new BN(3)).div(new BN(2));
        await teaToken.transfer(seedSwap.address, tokenAmount, { from: owner });
        await seedSwap.swapEthToToken({ value: ethAmount.sub(new BN(1)), from: user });
        await expectRevertWithMessage(user, ethAmount, "capSwap: not enough token to swap");
        // still can swap with smaller amount
        await seedSwap.swapEthToToken({ value: ethAmount.div(new BN(2)), from: owner });
      });

      it(`Test pause`, async() => {
        await delayToStartTime();
        await seedSwap.pause({ from: owner });
        await expectRevertWithMessage(user, ethAmount, "paused");
      });
    });
  });
});
