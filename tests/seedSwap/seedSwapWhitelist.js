const TeaToken = artifacts.require('TeaToken.sol');
const SeedSwap = artifacts.require('SeedSwap.sol');

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

/// Test WhitelistExtension contracts
contract('SeedSwap - Whitelist', accounts => {
  describe('test whitelist contract, pause, add/remove whitelists', async () => {
    before('init data and contracts', async () => {
      deployer = accounts[0];
      admin = accounts[1];
      owner = accounts[2];
      user = accounts[3];
      teaToken = await TeaToken.new(admin);
      seedSwap = await SeedSwap.new(owner, teaToken.address, { from: deployer });
    });

    it(`Test pause`, async() => {
      Helper.assertEqual(false, await seedSwap.isPaused());
      // check only whitelist admin can pause
      await expectRevert(
        seedSwap.pause({ from: user}),
        "WhitelistAdminRole: caller does not have the WhitelistAdmin role"
      );
      // check only can unpause when paused
      await expectRevert(
        seedSwap.unpause({ from: owner}),
        "not paused"
      );
      // set pause to true
      await seedSwap.pause({ from: owner });
      // only can unpause by admin
      await expectRevert(
        seedSwap.unpause({ from: user}),
        "WhitelistAdminRole: caller does not have the WhitelistAdmin role"
      );
      // only can pause when it's unpaused
      await expectRevert(
        seedSwap.pause({ from: owner}),
        "paused"
      );
      // set back to unpaused
      await seedSwap.unpause({ from: owner });
    });

    it(`Test whitelist admin`, async() => {
      // only owner can add/remove
      await expectRevert(
        seedSwap.updateWhitelistedAdmins(
          [admin],
          true,
          { from: user }
        ),
        "Ownable: caller is not the owner"
      );
      await expectRevert(
        seedSwap.updateWhitelistedAdmins(
          [admin],
          false,
          { from: user }
        ),
        "Ownable: caller is not the owner"
      );
      // remove first if already an admin
      await seedSwap.updateWhitelistedAdmins([admin], false, { from: owner });
      // add new admin and check data is update
      await seedSwap.updateWhitelistedAdmins([admin], true, { from: owner });
      Helper.assertEqual(true, await seedSwap.isWhitelistAdmin(admin));
      // tx won't revert if add again
      await seedSwap.updateWhitelistedAdmins([admin], true, { from: owner });
      Helper.assertEqual(true, await seedSwap.isWhitelistAdmin(admin));
      // remove admin and check data
      await seedSwap.updateWhitelistedAdmins([admin], false, { from: owner });
      Helper.assertEqual(false, await seedSwap.isWhitelistAdmin(admin));
      // tx won't revert if remove again
      await seedSwap.updateWhitelistedAdmins([admin, deployer], false, { from: owner });
      Helper.assertEqual(false, await seedSwap.isWhitelistAdmin(admin));
    });

    it(`Test whitelist users`, async() => {
      // add admin if needed
      if (await seedSwap.isWhitelistAdmin(admin) == false) {
        await seedSwap.updateWhitelistedAdmins([admin], true, { from: owner });
      }
      // only admin can add/remove
      await expectRevert(
        seedSwap.updateWhitelistedUsers(
          [user],
          true,
          { from: user }
        ),
        "WhitelistAdminRole: caller does not have the WhitelistAdmin role"
      );
      await expectRevert(
        seedSwap.updateWhitelistedUsers(
          [user],
          false,
          { from: user }
        ),
        "WhitelistAdminRole: caller does not have the WhitelistAdmin role"
      );
      // remove first if already whitelisted
      await seedSwap.updateWhitelistedUsers([user], false, { from: admin });
      // add new whitelisted user and check data is update
      await seedSwap.updateWhitelistedUsers([user], true, { from: admin });
      Helper.assertEqual(true, await seedSwap.isWhitelisted(user));
      // tx won't revert if add again
      await seedSwap.updateWhitelistedUsers([user], true, { from: admin });
      // remove user and check data
      await seedSwap.updateWhitelistedUsers([user], false, { from: admin });
      Helper.assertEqual(false, await seedSwap.isWhitelisted(user));
      // tx won't revert if remove again
      await seedSwap.updateWhitelistedUsers([user, deployer], false, { from: admin });
      Helper.assertEqual(false, await seedSwap.isWhitelisted(user));
    });
  });
});
