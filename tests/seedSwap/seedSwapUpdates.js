const TeaToken = artifacts.require('TeaToken.sol');
const SeedSwap = artifacts.require('SeedSwap.sol');

const BN = web3.utils.BN;

const Helper = require('../helper');
const { address0 } = require('../helper');
const {expectRevert, expectEvent} = require('@openzeppelin/test-helpers');

let defaultSaleStart = new BN(1609729200);
let defaultSaleEnd = new BN(1610384340);
let defaultRate = new BN(20000);
let defaultRecipient;

let teaToken;
let seedSwap;
let deployer;
let admin;
let owner;

/// Test update default values like: sale times, sale rate, eth recipient
contract('SeedSwap - Update default values', accounts => {
  describe('test update default values', async () => {
    before('init data and contracts', async () => {
      deployer = accounts[0];
      admin = accounts[1];
      owner = accounts[2];
      teaToken = await TeaToken.new(admin);
    });

    beforeEach(`Before each test`, async() => {
      seedSwap = await SeedSwap.new(owner, teaToken.address, { from: deployer });
      await seedSwap.updateWhitelistedAdmins([admin], true, { from: owner });
    });

    it(`Test update sale times`, async() => {
      Helper.assertEqual(defaultSaleStart, await seedSwap.saleStartTime());
      Helper.assertEqual(defaultSaleEnd, await seedSwap.saleEndTime());

      // can not update, not owner
      await expectRevert(
        seedSwap.updateSaleTimes(defaultSaleStart, defaultSaleEnd, { from: admin }),
        "Ownable: caller is not the owner"
      );
      // can not update start in the past
      let currentTime = new BN(await Helper.currentBlockTime());
      await expectRevert(
        seedSwap.updateSaleTimes(currentTime.sub(new BN(10)), defaultSaleEnd, { from: owner }),
        "Times: invalid start time"
      );
      // start >= end
      await expectRevert(
        seedSwap.updateSaleTimes(defaultSaleEnd, defaultSaleEnd, { from: owner }),
        "Times: invalid start and end time"
      );
      // update with event, data changes
      currentTime = new BN(await Helper.currentBlockTime());
      let newStartTime = currentTime.add(new BN(100));
      let newEndTime = currentTime.add(new BN(1000));
      let tx = await seedSwap.updateSaleTimes(newStartTime, newEndTime, { from: owner });
      expectEvent(tx, "UpdateSaleTimes", {
        newStartTime: newStartTime,
        newEndTime: newEndTime
      });
      Helper.assertEqual(newStartTime, await seedSwap.saleStartTime());
      Helper.assertEqual(newEndTime, await seedSwap.saleEndTime());
      // delay to start time
      await Helper.delayChainTime(100);
      // check can not update after started
      await expectRevert(
        seedSwap.updateSaleTimes(defaultSaleStart, defaultSaleEnd, { from: owner }),
        "already started"
      );
    });

    it(`Test update sale rate`, async() => {
      Helper.assertEqual(defaultRate, await seedSwap.saleRate());

      // can not update, not owner
      await expectRevert(
        seedSwap.updateSaleRate(defaultRate, { from: admin }),
        "Ownable: caller is not the owner"
      );
      // check can not update with low rate
      let newRate = defaultRate.div(new BN(2)).sub(new BN(1));
      await expectRevert(
        seedSwap.updateSaleRate(newRate, { from : owner }),
        "Rates: new rate too low"
      );
      // check can not update with high rate
      newRate = defaultRate.mul(new BN(3)).div(new BN(2)).add(new BN(1));
      await expectRevert(
        seedSwap.updateSaleRate(newRate, { from : owner }),
        "Rates: new rate too high"
      );
      // update with lower rate, check event & data changes
      newRate = defaultRate.div(new BN(2));
      let tx = await seedSwap.updateSaleRate(newRate, { from: owner });
      expectEvent(tx, "UpdateSaleRate", {
        newSaleRate: newRate
      });
      Helper.assertEqual(newRate, await seedSwap.saleRate());
      // update with higher rate, check data changes
      newRate = newRate.mul(new BN(3)).div(new BN(2));
      await seedSwap.updateSaleRate(newRate, { from: owner });
      Helper.assertEqual(newRate, await seedSwap.saleRate());
      // update sale times, then check can not update rate after ended
      currentTime = new BN(await Helper.currentBlockTime());
      let newStartTime = currentTime.add(new BN(20));
      let newEndTime = currentTime.add(new BN(30));
      await seedSwap.updateSaleTimes(newStartTime, newEndTime, { from: owner });
      // delay to end time
      await Helper.delayChainTime(100);
      await expectRevert(
        seedSwap.updateSaleRate(newRate, { from: owner }),
        "already ended"
      );
    });

    it(`Test update recipient`, async() => {
      defaultRecipient = owner;
      Helper.assertEqual(defaultRecipient, await seedSwap.ethRecipient());

      // can not update, not owner
      await expectRevert(
        seedSwap.updateEthRecipientAddress(defaultRecipient, { from: admin }),
        "Ownable: caller is not the owner"
      );
      // check can not update with zero address
      await expectRevert(
        seedSwap.updateEthRecipientAddress(address0, { from : owner }),
        "Receipient: invalid eth recipient address"
      );
      let newRecipient = accounts[6];
      let tx = await seedSwap.updateEthRecipientAddress(newRecipient, { from: owner });
      expectEvent(tx, "UpdateEthRecipient", {
        newRecipient: newRecipient
      });
      Helper.assertEqual(newRecipient, await seedSwap.ethRecipient());
    });
  });
});
