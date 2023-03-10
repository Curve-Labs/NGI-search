import { expect } from "chai";
import hre, { deployments, waffle } from "hardhat";
import "@nomiclabs/hardhat-ethers";

describe("Clearance", async () => {
  const baseSetup = deployments.createFixture(async () => {
    await deployments.fixture();
    const Avatar = await hre.ethers.getContractFactory("TestAvatar");
    const avatar = await Avatar.deploy();
    const TestContract = await hre.ethers.getContractFactory("TestContract");
    const testContract = await TestContract.deploy();
    const testContractClone = await TestContract.deploy();
    const Badger = await hre.ethers.getContractFactory("Badger");
    const badger = await Badger.deploy("ipfs://");

    return { Avatar, avatar, testContract, testContractClone, badger };
  });

  const setupRolesWithOwnerAndInvoker = deployments.createFixture(async () => {
    const base = await baseSetup();

    const [owner, invoker] = waffle.provider.getWallets();

    const Permissions = await hre.ethers.getContractFactory("Permissions");
    const permissions = await Permissions.deploy();
    const Modifier = await hre.ethers.getContractFactory("Roles", {
      libraries: {
        Permissions: permissions.address,
      },
    });

    const modifier = await Modifier.deploy(
      owner.address,
      base.avatar.address,
      base.avatar.address,
      base.badger.address
    );

    return {
      ...base,
      Modifier,
      modifier,
      owner,
      invoker,
    };
  });

  const OPTIONS_NONE = 0;
  const OPTIONS_SEND = 1;
  const OPTIONS_DELEGATECALL = 1;
  const OPTIONS_BOTH = 2;

  it("allows and then disallows a target", async () => {
    const { modifier, testContract, owner, invoker, badger } =
      await setupRolesWithOwnerAndInvoker();
    const BADGE_ID = 1;
    const { data } = await testContract.populateTransaction.doNothing();
    await badger.mint(invoker.address, BADGE_ID, 1);
    await expect(
      modifier
        .connect(invoker)
        .execTransactionFromModule(testContract.address, 0, data, 0, BADGE_ID)
    ).to.be.revertedWith("TargetAddressNotAllowed()");

    await modifier
      .connect(owner)
      .allowTarget(BADGE_ID, testContract.address, OPTIONS_NONE);

    await expect(
      modifier
        .connect(invoker)
        .execTransactionFromModule(testContract.address, 0, data, 0, BADGE_ID)
    ).to.not.be.reverted;

    await modifier.connect(owner).revokeTarget(BADGE_ID, testContract.address);

    await expect(
      modifier
        .connect(invoker)
        .execTransactionFromModule(testContract.address, 0, data, 0, BADGE_ID)
    ).to.be.revertedWith("TargetAddressNotAllowed()");
  });

  it("allowing a target does not allow other targets", async () => {
    const {
      modifier,
      testContract,
      testContractClone,
      owner,
      invoker,
      badger,
    } = await setupRolesWithOwnerAndInvoker();

    const BADGE_ID = 1;

    await badger.mint(invoker.address, BADGE_ID, 1);

    await modifier
      .connect(owner)
      .allowTarget(BADGE_ID, testContract.address, OPTIONS_NONE);

    const { data } = await testContract.populateTransaction.doNothing();

    await expect(
      modifier
        .connect(invoker)
        .execTransactionFromModule(testContract.address, 0, data, 0, BADGE_ID)
    ).to.not.be.reverted;

    await expect(
      modifier
        .connect(invoker)
        .execTransactionFromModule(
          testContractClone.address,
          0,
          data,
          0,
          BADGE_ID
        )
    ).to.be.revertedWith("TargetAddressNotAllowed()");
  });

  it("allows and then disallows a function", async () => {
    const { modifier, testContract, owner, invoker, badger } =
      await setupRolesWithOwnerAndInvoker();
    const BADGE_ID = 1;

    await badger.mint(invoker.address, BADGE_ID, 1);

    const SELECTOR = testContract.interface.getSighash(
      testContract.interface.getFunction("doNothing")
    );

    await modifier.connect(owner).scopeTarget(BADGE_ID, testContract.address);

    await modifier
      .connect(owner)
      .scopeAllowFunction(
        BADGE_ID,
        testContract.address,
        SELECTOR,
        OPTIONS_NONE
      );

    const { data } = await testContract.populateTransaction.doNothing();

    await expect(
      modifier
        .connect(invoker)
        .execTransactionFromModule(testContract.address, 0, data, 0, BADGE_ID)
    ).to.not.be.reverted;

    await modifier
      .connect(owner)
      .scopeRevokeFunction(BADGE_ID, testContract.address, SELECTOR);

    await expect(
      modifier
        .connect(invoker)
        .execTransactionFromModule(testContract.address, 0, data, 0, BADGE_ID)
    ).to.be.revertedWith("FunctionNotAllowed()");
  });

  it("allowing function on a target does not allow same function on diff target", async () => {
    const {
      modifier,
      testContract,
      testContractClone,
      owner,
      invoker,
      badger,
    } = await setupRolesWithOwnerAndInvoker();

    const BADGE_ID = 1;

    await badger.mint(invoker.address, BADGE_ID, 1);

    const SELECTOR = testContract.interface.getSighash(
      testContract.interface.getFunction("doNothing")
    );

    await modifier.connect(owner).scopeTarget(BADGE_ID, testContract.address);

    await modifier
      .connect(owner)
      .scopeAllowFunction(
        BADGE_ID,
        testContract.address,
        SELECTOR,
        OPTIONS_NONE
      );

    const { data } = await testContract.populateTransaction.doNothing();

    // should work on testContract
    await expect(
      modifier
        .connect(invoker)
        .execTransactionFromModule(testContract.address, 0, data, 0, BADGE_ID)
    ).to.not.be.reverted;

    // but fail on the clone
    await expect(
      modifier
        .connect(invoker)
        .execTransactionFromModule(
          testContractClone.address,
          0,
          data,
          0,
          BADGE_ID
        )
    ).to.be.revertedWith("TargetAddressNotAllowed()");
  });

  it("allowing a function tightens a previously allowed target", async () => {
    const { modifier, testContract, owner, invoker, badger } =
      await setupRolesWithOwnerAndInvoker();

    const BADGE_ID = 1;
    const SELECTOR = testContract.interface.getSighash(
      testContract.interface.getFunction("doNothing")
    );

    await badger.mint(invoker.address, BADGE_ID, 1);

    await modifier
      .connect(owner)
      .allowTarget(BADGE_ID, testContract.address, OPTIONS_NONE);

    const { data: dataDoNothing } =
      await testContract.populateTransaction.doNothing();
    const { data: dataDoEvenLess } =
      await testContract.populateTransaction.doEvenLess();

    await expect(
      modifier
        .connect(invoker)
        .execTransactionFromModule(
          testContract.address,
          0,
          dataDoEvenLess,
          0,
          BADGE_ID
        )
    ).to.not.be.reverted;
    await modifier.connect(owner).scopeTarget(BADGE_ID, testContract.address);

    await modifier
      .connect(owner)
      .scopeAllowFunction(
        BADGE_ID,
        testContract.address,
        SELECTOR,
        OPTIONS_NONE
      );

    await expect(
      modifier
        .connect(invoker)
        .execTransactionFromModule(
          testContract.address,
          0,
          dataDoNothing,
          0,
          BADGE_ID
        )
    ).to.not.be.reverted;

    await expect(
      modifier
        .connect(invoker)
        .execTransactionFromModule(
          testContract.address,
          0,
          dataDoEvenLess,
          0,
          BADGE_ID
        )
    ).to.be.revertedWith("FunctionNotAllowed()");
  });

  it("allowing a target loosens a previously allowed function", async () => {
    const { modifier, testContract, owner, invoker, badger } =
      await setupRolesWithOwnerAndInvoker();
    const BADGE_ID = 1;
    await badger.mint(invoker.address, BADGE_ID, 1);

    const SELECTOR = testContract.interface.getSighash(
      testContract.interface.getFunction("doNothing")
    );
    const { data: dataDoNothing } =
      await testContract.populateTransaction.doNothing();
    const { data: dataDoEvenLess } =
      await testContract.populateTransaction.doEvenLess();

    await modifier.connect(owner).scopeTarget(BADGE_ID, testContract.address);

    await modifier
      .connect(owner)
      .scopeAllowFunction(
        BADGE_ID,
        testContract.address,
        SELECTOR,
        OPTIONS_NONE
      );

    await expect(
      modifier
        .connect(invoker)
        .execTransactionFromModule(
          testContract.address,
          0,
          dataDoNothing,
          0,
          BADGE_ID
        )
    ).to.not.be.reverted;

    await expect(
      modifier
        .connect(invoker)
        .execTransactionFromModule(
          testContract.address,
          0,
          dataDoEvenLess,
          0,
          BADGE_ID
        )
    ).to.be.revertedWith("FunctionNotAllowed()");

    await modifier
      .connect(owner)
      .allowTarget(BADGE_ID, testContract.address, OPTIONS_NONE);

    await expect(
      modifier
        .connect(invoker)
        .execTransactionFromModule(
          testContract.address,
          0,
          dataDoEvenLess,
          0,
          BADGE_ID
        )
    ).to.emit(testContract, "DoEvenLess");
  });

  it("disallowing one function does not impact other function allowances", async () => {
    const { modifier, testContract, owner, invoker, badger } =
      await setupRolesWithOwnerAndInvoker();

    const BADGE_ID = 1;
    await badger.mint(invoker.address, BADGE_ID, 1);

    const SEL_DONOTHING = testContract.interface.getSighash(
      testContract.interface.getFunction("doNothing")
    );
    const SEL_DOEVENLESS = testContract.interface.getSighash(
      testContract.interface.getFunction("doEvenLess")
    );
    const { data: dataDoNothing } =
      await testContract.populateTransaction.doNothing();
    const { data: dataDoEvenLess } =
      await testContract.populateTransaction.doEvenLess();

    await modifier.connect(owner).scopeTarget(BADGE_ID, testContract.address);

    await modifier
      .connect(owner)
      .scopeAllowFunction(
        BADGE_ID,
        testContract.address,
        SEL_DONOTHING,
        OPTIONS_NONE
      );

    await modifier
      .connect(owner)
      .scopeAllowFunction(
        BADGE_ID,
        testContract.address,
        SEL_DOEVENLESS,
        OPTIONS_NONE
      );

    await expect(
      modifier
        .connect(invoker)
        .execTransactionFromModule(
          testContract.address,
          0,
          dataDoNothing,
          0,
          BADGE_ID
        )
    ).to.not.be.reverted;

    await expect(
      modifier
        .connect(invoker)
        .execTransactionFromModule(
          testContract.address,
          0,
          dataDoEvenLess,
          0,
          BADGE_ID
        )
    ).to.not.be.reverted;

    await modifier
      .connect(owner)
      .scopeRevokeFunction(BADGE_ID, testContract.address, SEL_DOEVENLESS);

    await expect(
      modifier
        .connect(invoker)
        .execTransactionFromModule(
          testContract.address,
          0,
          dataDoNothing,
          0,
          BADGE_ID
        )
    ).to.not.be.reverted;

    await expect(
      modifier
        .connect(invoker)
        .execTransactionFromModule(
          testContract.address,
          0,
          dataDoEvenLess,
          0,
          BADGE_ID
        )
    ).to.be.revertedWith("FunctionNotAllowed");
  });
});
