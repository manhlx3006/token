const TeaToken = artifacts.require('TeaToken.sol');
const SeedSwap = artifacts.require('SeedSwap.sol');
const MockTestSeedSwap = artifacts.require('MockTestSeedSwap.sol');

const BN = web3.utils.BN;

const Helper = require('../helper');
const { ethAddress, address0, ethDecimals, ethUnit} = require('../helper');
const {expectRevert, expectEvent} = require('@openzeppelin/test-helpers');

let teaToken;
let seedSwap;
let deployer;
let admin;
let owner;
let user;
let ethAmount = new BN(10).pow(new BN(15));

contract('SeedSwap', accounts => {
  describe('Test SeedSwap main functions', async () => {
    before('test trade in uniswap curve', async () => {
      deployer = accounts[0];
      admin = accounts[1];
      owner = accounts[2];
      user = accounts[3];
      teaToken = await TeaToken.new(owner);
      seedSwap = await SeedSwap.new(owner, teaToken.address, { from: deployer });
    });

    describe(`Test Constructor`, async() => {
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
          SeedSwap.new(owner, address0, { from: deployer }),
            "constructor: invalid token"
        );
      });
    });

    const delayToStartTime = async() => {
      // delay to start time
      let currentTime = await Helper.currentBlockTime();
      let duration = (await seedSwap.saleStartTime()) * 1 - currentTime;
      await Helper.delayChainTime(duration);
    }

    const delayToEndTime = async() => {
      // delay to start time
      let currentTime = await Helper.currentBlockTime();
      let duration = (await seedSwap.saleEndTime()) * 1 - currentTime;
      await Helper.delayChainTime(duration);
    }

    describe(`Test Invalid swaps`, async() => {
      beforeEach(`Init contracts for each test`, async() => {
        let currentTime = new BN(await Helper.currentBlockTime());
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
          Helper.transferEth(user, seedSwap.address, amount),
          errorMessage
        );
      }

      it(`Test positive amount`, async() => {
        await expectRevertWithMessage(user, new BN(0), "onlyCanSwap: amount is 0");
      });

      it(`Test sale has not started`, async() => {
        await expectRevertWithMessage(user, ethAmount, "onlyCanSwap: not started yet");
      });

      it(`Test sale already ended`, async() => {
        let currentTime = await Helper.currentBlockTime();
        let duration = (await seedSwap.saleEndTime()) * 1 - currentTime;
        await Helper.delayChainTime(duration);
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
        let currentTime = new BN(await Helper.currentBlockTime());
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
        let currentTime = new BN(await Helper.currentBlockTime());
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

    const generateUserObject = function() {
      return {
        eAmount: new BN(0),
        tAmount: new BN(0),
        dAmount: new BN(0),
        ids: []
      }
    }

    const checkSwapObjectEqual = function(first, second) {
      Helper.assertEqual(first.user, second.user);
      Helper.assertEqual(first.eAmount, second.eAmount);
      Helper.assertEqual(first.tAmount, second.tAmount);
      Helper.assertEqual(first.dAmount, second.dAmount);
      Helper.assertEqual(first.timestamp, second.timestamp);
    }

    const generateSwapObject = function(sender, eAmount, tAmount) {
      return {
        user: sender,
        eAmount: eAmount,
        tAmount: tAmount,
        dAmount: new BN(0),
        timestamp: new BN(0)
      }
    }

    const checkUserData = async function(sender, userData, swapObjects) {
      let data = await seedSwap.getUserSwapData(sender);
      Helper.assertEqual(userData.eAmount, data.totalEthAmount);
      Helper.assertEqual(userData.tAmount, data.totalTokenAmount);
      Helper.assertEqual(userData.dAmount, data.distributedAmount);
      Helper.assertEqual(userData.tAmount.sub(userData.dAmount), data.remainingAmount);
      // check individual swap object
      Helper.assertEqual(userData.ids.length, data.ethAmounts.length);
      Helper.assertEqual(userData.ids.length, data.tokenAmounts.length);
      Helper.assertEqual(userData.ids.length, data.distributedAmounts.length);
      Helper.assertEqual(userData.ids.length, data.timestamps.length);
      for(let j = 0; j < userData.ids.length; j++) {
        let object = swapObjects[userData.ids[j]];
        Helper.assertEqual(object.eAmount, data.ethAmounts[j]);
        Helper.assertEqual(object.tAmount, data.tokenAmounts[j]);
        Helper.assertEqual(object.dAmount, data.distributedAmounts[j]);
        Helper.assertEqual(object.timestamp, data.timestamps[j]);
      }
    }

    describe(`Test Swap, data changes correctly`, async() => {
      let userData = {}
      let swapObjects = [];
      let currentEthSwapped;
      let currentTokenSwapped;
      beforeEach(`Init contracts for each test`, async() => {
        let currentTime = new BN(await Helper.currentBlockTime());
        seedSwap = await MockTestSeedSwap.new(
          owner,
          teaToken.address,
          currentTime.add(new BN(20)),  // start
          currentTime.add(new BN(3000)), // end
          new BN(10).pow(new BN(18)),   // hard cap
          new BN(10).pow(new BN(18)),   // user's cap
          { from: deployer }
        );
        // add all users as whitelisted
        await seedSwap.updateWhitelistedUsers(accounts, true, { from: owner });
        await delayToStartTime();
        userData = {}
        currentEthSwapped = new BN(0);
        currentTokenSwapped = new BN(0);
      });

      it(`Test multiple swaps`, async() => {
        let numLoops = 50;
        let ethRecipient = await seedSwap.ethRecipient();
        let userMinCap = await seedSwap.MIN_INDIVIDUAL_CAP();

        let gasUsed = new BN(0);
        let txCount = 0;

        for(let i = 0; i < numLoops; i++) {
          let ethAmount = userMinCap.add(new BN(Helper.getRandomNumer(0, 1000000000)));
          let expectedTokenAmount = ethAmount.mul(await seedSwap.saleRate());
          let userId;
          while (true) {
            // don't use eth recipient to swap
            userId = Helper.getRandomNumer(0, accounts.length - 1);
            if (accounts[userId] != ethRecipient) { break; }
          }
          let sender = accounts[userId];
          let tx;

          let balanceEthBefore = await Helper.getEthBalance(ethRecipient);
          if (Helper.getRandomNumer(0, 100) % 2 == 0) {
            tx = await seedSwap.swapEthToToken({ from: sender, value: ethAmount });
            txCount += 1;
            gasUsed.iadd(new BN(tx.receipt.gasUsed));
          } else {
            await Helper.transferEth(sender, seedSwap.address, ethAmount);
          }
          let balanceEthAfter = await Helper.getEthBalance(ethRecipient);

          /// update data
          currentEthSwapped.iadd(ethAmount);
          currentTokenSwapped.iadd(expectedTokenAmount);

          let swapObject = generateSwapObject(sender, ethAmount, expectedTokenAmount, 0);
          swapObject.timestamp = new BN(await Helper.currentBlockTime());
          swapObjects.push(swapObject);
          if (userData[sender] == undefined) {
            userData[sender] = generateUserObject();
          }
          userData[sender].eAmount.iadd(ethAmount);
          userData[sender].tAmount.iadd(expectedTokenAmount);
          userData[sender].ids.push(swapObjects.length - 1);

          /// verify data
          Helper.assertEqual(ethAmount, balanceEthAfter.sub(balanceEthBefore), "eth is not received correctly");
          Helper.assertEqual(currentEthSwapped, await seedSwap.totalSwappedEth(), "total eth is not recorded correctly");
          Helper.assertEqual(currentTokenSwapped, await seedSwap.totalSwappedToken(), "total token is not recorded correctly");
          Helper.assertEqual(new BN(0), await seedSwap.totalDistributedToken());
          Helper.assertEqual(swapObjects.length, await seedSwap.getNumberSwaps(), "number swaps is wrong");

          // check swap data
          let data = await seedSwap.listSwaps(swapObjects.length - 1);
          checkSwapObjectEqual(swapObject, data);
          // check user data
          checkUserData(sender, userData[sender], swapObjects);
        }
        console.log(`          Average gas used for ${numLoops}: ${gasUsed.div(new BN(txCount)).toString(10)}`);
      });

      it(`Test swap after update sale rate`, async() => {
        let userMinCap = await seedSwap.MIN_INDIVIDUAL_CAP();
        let ethAmount = userMinCap.add(new BN(Helper.getRandomNumer(0, 1000000000)));
        let saleRate = await seedSwap.saleRate();
        let expectedTokenAmount = ethAmount.mul(saleRate);
        await seedSwap.swapEthToToken({ from: user, value: ethAmount });
        currentEthSwapped.iadd(ethAmount);
        currentTokenSwapped.iadd(expectedTokenAmount);

        for(let i = 0; i < 4; i++) {
          /// update sale rate
          saleRate = saleRate.add(new BN(Helper.getRandomNumer(0, saleRate / 2)));
          await seedSwap.updateSaleRate(saleRate, { from: owner });
          Helper.assertEqual(saleRate, await seedSwap.saleRate());

          expectedTokenAmount = ethAmount.mul(saleRate);
          await seedSwap.swapEthToToken({ from: user, value: ethAmount });

          currentEthSwapped.iadd(ethAmount);
          currentTokenSwapped.iadd(expectedTokenAmount);

          Helper.assertEqual(currentEthSwapped, await seedSwap.totalSwappedEth(), "total eth is not recorded correctly");
          Helper.assertEqual(currentTokenSwapped, await seedSwap.totalSwappedToken(), "total token is not recorded correctly");

          let numberObject = await seedSwap.getNumberSwaps();
          let data = await seedSwap.listSwaps(numberObject * 1 - 1);
          Helper.assertEqual(ethAmount, data.eAmount);
          Helper.assertEqual(expectedTokenAmount, data.tAmount);
          Helper.assertEqual(new BN(0), data.dAmount);
        }
      });

      it(`Test swap after update recipient`, async() => {
        let userMinCap = await seedSwap.MIN_INDIVIDUAL_CAP();
        let ethAmount = userMinCap.add(new BN(Helper.getRandomNumer(0, 1000000000)));

        for(let i = 0; i < 4; i++) {
          await seedSwap.updateEthRecipientAddress(accounts[i], { from: owner });

          let balanceBefore = await Helper.getEthBalance(accounts[i]);
          await seedSwap.swapEthToToken({ value: ethAmount, from: accounts[6] });
          let balanceAfter = await Helper.getEthBalance(accounts[i]);
          Helper.assertEqual(ethAmount, balanceAfter.sub(balanceBefore));
        }
      });
    });

    describe(`Test distribute`, async() => {
      let userData = {}
      let swapObjects = [];
      let currentEthSwapped;
      let currentTokenSwapped;
      let totalDistributed;
      let userTokenBalances = {};
      beforeEach(`Init contracts for each test`, async() => {
        let currentTime = new BN(await Helper.currentBlockTime());
        seedSwap = await MockTestSeedSwap.new(
          owner,
          teaToken.address,
          currentTime.add(new BN(20)),  // start
          currentTime.add(new BN(100)), // end
          new BN(10).pow(new BN(18)),   // hard cap
          new BN(10).pow(new BN(18)),   // user's cap
          { from: deployer }
        );
        // add all users as whitelisted admin and users
        await seedSwap.updateWhitelistedAdmins(accounts, true, { from: owner });
        await seedSwap.updateWhitelistedUsers(accounts, true, { from: owner });
        await delayToStartTime();
        userData = {}
        swapObjects = [];
        currentEthSwapped = new BN(0);
        currentTokenSwapped = new BN(0);
        totalDistributed = new BN(0);
        userTokenBalances = {};
        for(let i = 0; i < accounts.length; i++) {
          userTokenBalances[accounts[i]] = await teaToken.balanceOf(accounts[i]);
          userData[accounts[i]] = generateUserObject();
        }
      });

      const makeSomeSwaps = async function(num) {
        let userMinCap = await seedSwap.MIN_INDIVIDUAL_CAP();
        for(let id = 0; id < num; id++) {
          let ethAmount = userMinCap.add(new BN(Helper.getRandomNumer(0, 1000000000)));
          let expectedTokenAmount = ethAmount.mul(await seedSwap.saleRate());
          let userId = Helper.getRandomNumer(0, accounts.length - 1);
          let sender = accounts[userId];

          if (Helper.getRandomNumer(0, 100) % 2 == 0) {
            await seedSwap.swapEthToToken({ from: sender, value: ethAmount });
          } else {
            await Helper.transferEth(sender, seedSwap.address, ethAmount);
          }

          /// update data
          currentEthSwapped.iadd(ethAmount);
          currentTokenSwapped.iadd(expectedTokenAmount);

          let swapObject = generateSwapObject(sender, ethAmount, expectedTokenAmount, 0);
          swapObject.timestamp = new BN(await Helper.currentBlockTime());
          swapObjects.push(swapObject);
          if (userData[sender] == undefined) {
            userData[sender] = generateUserObject();
          }
          userData[sender].eAmount.iadd(ethAmount);
          userData[sender].tAmount.iadd(expectedTokenAmount);
          userData[sender].ids.push(swapObjects.length - 1);
        }
      }

      const updateDataAfterDistributed = async function(percentage, id) {
        let amount = swapObjects[id].tAmount.sub(swapObjects[id].dAmount);
        amount = amount.mul(new BN(percentage)).div(new BN(100));
        swapObjects[id].dAmount = swapObjects[id].dAmount.add(amount);
        // check object and user's data have been updated correctly
        checkSwapObjectEqual(swapObjects[id], await seedSwap.listSwaps(id));
        let user = swapObjects[id].user;
        // add distributed amount to user, and user's token balance
        userData[user].dAmount = userData[user].dAmount.add(amount);
        userTokenBalances[user] = userTokenBalances[user].add(amount);
        return amount;
      }

      it(`Test distributeAll`, async() => {
        await makeSomeSwaps(40);
        await delayToEndTime();
        let totalTokens = await seedSwap.totalSwappedToken();
        await teaToken.transfer(seedSwap.address, totalTokens, { from: owner });
        userTokenBalances[owner] = userTokenBalances[owner].sub(totalTokens);
        totalDistributed = new BN(0);

        for(let i = 0; i < 5; i++) {
          let percentage = Helper.getRandomNumer(1, 99);
          let timeUnits = Helper.getRandomNumer(10, 100);
          let balanceBefore = await teaToken.balanceOf(seedSwap.address);
          await seedSwap.distributeAll(percentage, timeUnits, { from: admin });
          let balanceAfter = await teaToken.balanceOf(seedSwap.address);
          let timestamp = new BN((await Helper.currentBlockTime())).sub(
            new BN(timeUnits).mul(await seedSwap.DISTRIBUTE_PERIOD_UNIT())
          );
          let distributedAmount = new BN(0);
          for(let j = 0; j < swapObjects.length; j++) {
            if (swapObjects[j].timestamp > timestamp) break;
            let amount = await updateDataAfterDistributed(percentage, j);
            distributedAmount = distributedAmount.add(amount);
          }
          totalDistributed = totalDistributed.add(distributedAmount);
          Helper.assertEqual(distributedAmount, balanceBefore.sub(balanceAfter));
          Helper.assertEqual(totalDistributed, await seedSwap.totalDistributedToken());
          for(let j = 0; j < accounts.length; j++) {
            // check user data
            checkUserData(accounts[j], userData[accounts[j]], swapObjects);
            // check token balance
            Helper.assertEqual(userTokenBalances[accounts[j]], await teaToken.balanceOf(accounts[j]));
          }
        }
      });

      it(`Test distributeBatch`, async() => {
        await makeSomeSwaps(40);
        await delayToEndTime();
        let totalTokens = await seedSwap.totalSwappedToken();
        await teaToken.transfer(seedSwap.address, totalTokens, { from: owner });
        userTokenBalances[owner] = userTokenBalances[owner].sub(totalTokens);
        totalDistributed = new BN(0);

        for(let i = 0; i < 5; i++) {
          let percentage = Helper.getRandomNumer(1, 99);
          // create random batches
          let batches = [];
          for(let j = 0; j < swapObjects.length; j++) {
            if (Helper.getRandomNumer(0, 100) % 2 == 0) {
              batches.push(j);
            }
          }
          let balanceBefore = await teaToken.balanceOf(seedSwap.address);
          await seedSwap.distributeBatch(percentage, batches, { from: admin });
          let balanceAfter = await teaToken.balanceOf(seedSwap.address);
          let distributedAmount = new BN(0);
          for(let j = 0; j < batches.length; j++) {
            let amount = await updateDataAfterDistributed(percentage, batches[j]);
            distributedAmount = distributedAmount.add(amount);
          }
          totalDistributed = totalDistributed.add(distributedAmount);
          Helper.assertEqual(distributedAmount, balanceBefore.sub(balanceAfter));
          Helper.assertEqual(totalDistributed, await seedSwap.totalDistributedToken());
          for(let j = 0; j < accounts.length; j++) {
            // check user data
            checkUserData(accounts[j], userData[accounts[j]], swapObjects);
            // check token balance
            Helper.assertEqual(userTokenBalances[accounts[j]], await teaToken.balanceOf(accounts[j]));
          }
        }
      });

      it(`Test user emergency withdraw tokens`, async() => {
        await makeSomeSwaps(40);

        let totalTokens = await seedSwap.totalSwappedToken();
        await teaToken.transfer(seedSwap.address, totalTokens, { from: owner });
        userTokenBalances[owner] = userTokenBalances[owner].sub(totalTokens);
        totalDistributed = new BN(0);

        await expectRevert(
          seedSwap.emergencyUserWithdrawToken({ from: owner }),
          "Emergency: not open for emergency withdrawal"
        )
        // delay to emergency withdraw time
        let time = (await seedSwap.saleEndTime()).add(await seedSwap.WITHDRAWAL_DEADLINE()).add(new BN(1));
        let currentTime = await Helper.currentBlockTime();
        await Helper.delayChainTime(time * 1 - currentTime);

        for(let i = 0; i < accounts.length; i++) {
          let sender = accounts[i];
          let uAmount = userData[sender].tAmount.sub(userData[sender].dAmount);
          if (uAmount.gt(new BN(0))) {
            let balanceBefore = await teaToken.balanceOf(seedSwap.address);
            let userBefore = await teaToken.balanceOf(sender);
            await seedSwap.emergencyUserWithdrawToken({ from: sender });
            userData[sender].dAmount = userData[sender].tAmount;
            for(let j = 0; j < userData[sender].ids.length; j++) {
              let id = userData[sender].ids[j];
              swapObjects[id].dAmount = swapObjects[id].tAmount;
              checkSwapObjectEqual(swapObjects[id], await seedSwap.listSwaps(id));
            }
            let balanceAfter = await teaToken.balanceOf(seedSwap.address);
            let userAfter = await teaToken.balanceOf(sender);
            Helper.assertEqual(uAmount, balanceBefore.sub(balanceAfter));
            Helper.assertEqual(uAmount, userAfter.sub(userBefore));
            checkUserData(sender, userData[sender], swapObjects);
          } else {
            await expectRevert(
              seedSwap.emergencyUserWithdrawToken({ from: sender }),
              "Emergency: user has claimed all tokens"
            );
          }
        }
      });

      it(`Test distributeAll reverts`, async() => {
        await makeSomeSwaps(1);

        // check not admin
        await seedSwap.updateWhitelistedAdmins([user], false, { from: owner });
        await expectRevert(
          seedSwap.distributeAll(50, 0, { from: user }),
          "WhitelistAdminRole: caller does not have the WhitelistAdmin role"
        );

        // check revert not ended
        await expectRevert(
          seedSwap.distributeAll(50, 1000, { from: admin }),
          "not ended yet"
        );

        // delay to end time
        await delayToEndTime();

        // check revert when pause
        await seedSwap.pause({ from: admin });
        await expectRevert(
          seedSwap.distributeAll(50, 1000, { from: admin }),
          "paused"
        );

        // unpause
        await seedSwap.unpause({ from: admin });

        // check percentage is out of range (0 < percentage <= 100)
        await expectRevert(
          seedSwap.distributeAll(0, 1000, { from: admin }),
          "percentage out of range"
        );
        await expectRevert(
          seedSwap.distributeAll(101, 1000, { from: admin }),
          "percentage out of range"
        );

        // test not enough tea token
        // withdraw all tea token if any
        let teaBalance = await teaToken.balanceOf(seedSwap.address);
        if (teaBalance.gt(new BN(0))) {
          await seedSwap.emergencyOwnerWithdraw(teaToken.address, teaBalance, { from: owner });
        }
        await expectRevert(
          seedSwap.distributeAll(100, 0, { from: admin }),
          "Distribute: not enough token to distribute"
        );

        await teaToken.transfer(seedSwap.address, swapObjects[0].tAmount, { from: owner });
        await seedSwap.distributeAll(50, 0, { from: admin });
        await seedSwap.distributeAll(100, 0, { from: admin });
      });

      it(`Test distributeBatch reverts`, async() => {
        await makeSomeSwaps(2);

        // check not admin
        await seedSwap.updateWhitelistedAdmins([user], false, { from: owner });
        await expectRevert(
          seedSwap.distributeBatch(50, [0], { from: user }),
          "WhitelistAdminRole: caller does not have the WhitelistAdmin role"
        );

        // check revert not ended
        await expectRevert(
          seedSwap.distributeBatch(50, [0], { from: admin }),
          "not ended yet"
        );

        // delay to end time
        await delayToEndTime();

        // check revert when pause
        await seedSwap.pause({ from: admin });
        await expectRevert(
          seedSwap.distributeBatch(50, [0], { from: admin }),
          "paused"
        );

        // unpause
        await seedSwap.unpause({ from: admin });

        // check percentage is out of range (0 < percentage <= 100)
        await expectRevert(
          seedSwap.distributeBatch(0, [0], { from: admin }),
          "percentage out of range"
        );
        await expectRevert(
          seedSwap.distributeBatch(101, [0], { from: admin }),
          "percentage out of range"
        );

        // test not enough tea token
        // withdraw all tea token if any
        let teaBalance = await teaToken.balanceOf(seedSwap.address);
        if (teaBalance.gt(new BN(0))) {
          await seedSwap.emergencyOwnerWithdraw(teaToken.address, teaBalance, { from: owner });
        }
        await expectRevert(
          seedSwap.distributeBatch(100, [0], { from: admin }),
          "Distribute: not enough token to distribute"
        );

        // transfer enough token to distribute
        await teaToken.transfer(
          seedSwap.address,
          swapObjects[0].tAmount.add(swapObjects[1].tAmount),
          { from: owner }
        );

        // check index out of range
        await expectRevert(
          seedSwap.distributeBatch(50, [2], { from: admin }),
          "Distribute: invalid id"
        );
        // check indices are not in order
        await expectRevert(
          seedSwap.distributeBatch(50, [1, 0], { from: admin }),
          "Distribute: indices are not in order"
        );
        await expectRevert(
          seedSwap.distributeBatch(50, [1, 1], { from: admin }),
          "Distribute: indices are not in order"
        );

        await seedSwap.distributeBatch(50, [0,1], { from: admin });
        await seedSwap.distributeBatch(100, [0,1], { from: admin });
      });
    });
  });
});
