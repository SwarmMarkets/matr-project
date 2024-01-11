import { Signer } from "ethers";
import { MATR, VMATR } from "../typechain-types";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("vMATR Contract Tests", function () {
	let vMATR: VMATR, MATR: MATR, admin: Signer, user: Signer, otherAccount: Signer;
	let default_admin_role: string, pauser_role: string;

	beforeEach(async function () {
		const [deployer, userSigner, otherSigner] = await ethers.getSigners();
		admin = deployer;
		user = userSigner;
		otherAccount = otherSigner;

		const MATR_factory = await ethers.getContractFactory("MATRMock");
		MATR = await MATR_factory.deploy();

		const vMATR_factory = await ethers.getContractFactory("vMATR");
		vMATR = await vMATR_factory.deploy() as VMATR;

		default_admin_role = (await vMATR.DEFAULT_ADMIN_ROLE()).toLowerCase();
		pauser_role = (await vMATR.PAUSER_ROLE()).toLowerCase();
	});

	describe("Admin Functions", function () {
		// Test for setting the accepted token
		it("Admin should set the accepted token", async function () {
			await expect(vMATR.connect(admin).setAcceptedToken(MATR.address))
				.to.emit(vMATR, 'AcceptedTokenSet')
				.withArgs(MATR.address);
			expect(await vMATR.acceptedToken()).to.equal(MATR.address);
		});

		// Test for setting KYA
		it("Admin should be able to set KYA", async function () {
			const kyaString = "Know Your Asset Information";
			await expect(vMATR.connect(admin).setKYA(kyaString))
				.to.emit(vMATR, 'KYAset')
				.withArgs(kyaString);
			expect(await vMATR.kya()).to.equal(kyaString);
		});

		// Test for setting distribution start time
		it("Admin should set distribution start time", async function () {
			const startTime = Math.floor(Date.now() / 1000) + 3600;
			await expect(vMATR.connect(admin).setStartTime(startTime))
				.to.emit(vMATR, 'StartTimeSet')
				.withArgs(startTime);
			expect(await vMATR.distributionStartTime()).to.equal(startTime);
		});

		// Test for depositing tokens
		it("Admin should be able to deposit accepted tokens", async function () {
			await vMATR.setAcceptedToken(MATR.address);

			const depositAmount = ethers.utils.parseEther("1");
			await MATR.connect(admin).approve(vMATR.address, depositAmount);

			await expect(() => vMATR.connect(admin).deposit(depositAmount))
				.to.changeTokenBalance(MATR, vMATR, depositAmount);
		});

		// Test for pausing the contract
		it("Admin should be able to pause the contract", async function () {
			const tx = await vMATR.connect(admin).pause();

			await expect(tx)
				.to.emit(vMATR, 'Paused')
				.withArgs(await await admin.getAddress());

			expect(await vMATR.paused()).to.be.true;
		});

		// Test for unpausing the contract
		it("Admin should be able to unpause the contract", async function () {
			await vMATR.connect(admin).pause();
			await expect(vMATR.connect(admin).unpause())
				.to.emit(vMATR, 'Unpaused')
				.withArgs(await admin.getAddress());
			expect(await vMATR.paused()).to.be.false;
		});

		// Test for adding to whitelist
		it("Admin should be able to add an address to the whitelist", async function () {
			await expect(vMATR.connect(admin).addWhitelistedAddress(await user.getAddress()))
				.to.emit(vMATR, 'WhitelistedAddressAdded')
				.withArgs(await user.getAddress());
			expect(await vMATR.whitelisted(await user.getAddress())).to.be.true;
		});

		// Test for removing from whitelist
		it("Admin should be able to remove an address from the whitelist", async function () {
			await vMATR.connect(admin).addWhitelistedAddress(await user.getAddress());
			await expect(vMATR.connect(admin).removeWhitelistedAddress(await user.getAddress()))
				.to.emit(vMATR, 'WhitelistedAddressRemoved')
				.withArgs(await user.getAddress());
			expect(await vMATR.whitelisted(await user.getAddress())).to.be.false;
		});
	});

	describe("Whitelisting", function () {
		// Test for adding an address to the whitelist
		it("Should add an address to whitelist", async function () {
			await expect(vMATR.connect(admin).addWhitelistedAddress(await user.getAddress()))
				.to.emit(vMATR, 'WhitelistedAddressAdded')
				.withArgs(await user.getAddress());
			expect(await vMATR.whitelisted(await user.getAddress())).to.be.true;
		});

		// Test for removing an address from the whitelist
		it("Should remove an address from whitelist", async function () {
			await vMATR.connect(admin).addWhitelistedAddress(await user.getAddress());
			await expect(vMATR.connect(admin).removeWhitelistedAddress(await user.getAddress()))
				.to.emit(vMATR, 'WhitelistedAddressRemoved')
				.withArgs(await user.getAddress());
			expect(await vMATR.whitelisted(await user.getAddress())).to.be.false;
		});

		// Test for adding an address to whitelist by a non-admin
		it("Non-admin should not be able to add an address to whitelist", async function () {
			await expect(vMATR.connect(user).addWhitelistedAddress(await otherAccount.getAddress()))
				.to.be.revertedWith(`AccessControl: account ${(await user.getAddress()).toLowerCase()} is missing role ${default_admin_role}`);
		});

		// Test for removing an address from whitelist by a non-admin
		it("Non-admin should not be able to remove an address from whitelist", async function () {
			await vMATR.connect(admin).addWhitelistedAddress(await otherAccount.getAddress());
			await expect(vMATR.connect(user).removeWhitelistedAddress(await otherAccount.getAddress()))
				.to.be.revertedWith(`AccessControl: account ${(await user.getAddress()).toLowerCase()} is missing role ${default_admin_role}`);
		});

		// Test for adding a zero address to the whitelist
		it("Should not add zero address to whitelist", async function () {
			await expect(vMATR.connect(admin).addWhitelistedAddress(ethers.constants.AddressZero))
				.to.be.revertedWithCustomError(vMATR, "ZeroAddressPasted");
		});

		// Test for removing a zero address from the whitelist
		it("Should not remove zero address from whitelist", async function () {
			await expect(vMATR.connect(admin).removeWhitelistedAddress(ethers.constants.AddressZero))
				.to.be.revertedWithCustomError(vMATR, "InvalidAddressToRemove");
		});
	});


	describe("Token Vesting", function () {
		// Test for setting distribution start time by admin
		it("Should set distribution start time", async function () {
			let startTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
			await expect(vMATR.connect(admin).setStartTime(startTime))
				.to.emit(vMATR, 'StartTimeSet')
				.withArgs(startTime);
			expect(await vMATR.distributionStartTime()).to.equal(startTime);
		});

		// Test for setting distribution start time by non-admin
		it("Non-admin should not set distribution start time", async function () {
			let startTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
			await expect(vMATR.connect(user).setStartTime(startTime))
				.to.be.revertedWith(`AccessControl: account ${(await user.getAddress()).toLowerCase()} is missing role ${default_admin_role}`);
		});

		// Test for setting distribution start time to a past timestamp
		it("Should not set distribution start time to past", async function () {
			let pastTime = Math.floor(Date.now() / 1000) - 3600; // 1 hour in the past
			await expect(vMATR.connect(admin).setStartTime(pastTime))
				.to.be.revertedWithCustomError(vMATR, "InvalidStartTime");
		});

		// Test for setting distribution start time when it's already set
		it("Should not set distribution start time if already set", async function () {
			let initialTime = Math.floor(Date.now() / 1000) + 7200; // 2 hours from now
			await vMATR.connect(admin).setStartTime(initialTime);

			let newTime = initialTime + 3600; // 3 hours from now
			await expect(vMATR.connect(admin).setStartTime(newTime))
				.to.be.revertedWithCustomError(vMATR, "InvalidStartTime");
		});

		// Test for getting claimable amount before distribution start time
		it("Should not allow claiming before distribution start time", async function () {
			await expect(vMATR.connect(user).getClaimableAmount(await user.getAddress()))
				.to.be.revertedWithCustomError(vMATR, "DistributionStartTimeIsNotSet");
		});
	});

	describe("Token Claiming", function () {
		beforeEach(async function () {
			const now = (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp;

			const startTime = now + 3600; // 1 hour from now
			await vMATR.connect(admin).setStartTime(startTime);

			await vMATR.setAcceptedToken(MATR.address);
			await vMATR.addWhitelistedAddress(await user.getAddress());
			await vMATR.addWhitelistedAddress(await admin.getAddress());

			// Mint vMATR tokens to the user for claiming
			const depositAmount = ethers.utils.parseEther("100");
			await MATR.connect(admin).approve(vMATR.address, depositAmount);
			await vMATR.connect(admin).deposit(depositAmount);

			// Transfer vMATR tokens to the user
			await vMATR.connect(admin).transfer(await user.getAddress(), depositAmount);
		});

		it("Should allow users to claim tokens", async function () {
			// Forward time to enable claiming
			const timeForward = 7200; // 2 hours in the future
			await ethers.provider.send("evm_increaseTime", [timeForward]);
			await ethers.provider.send("evm_mine", []);

			// User claims a certain amount of tokens
			const claimAmount = ethers.utils.parseEther("10");
			await expect(vMATR.connect(user).claim(claimAmount))
				.to.emit(vMATR, 'Claim')
				.withArgs(await await user.getAddress(), claimAmount);

			// Check the balance of the user in the accepted token
			const userBalance = await MATR.balanceOf(await await user.getAddress());
			expect(userBalance).to.equal(claimAmount);
		});

		it("Should not allow users to claim more than available", async function () {
			// Forward time to enable claiming
			const timeForward = 7200; // 2 hours in the future
			await ethers.provider.send("evm_increaseTime", [timeForward]);
			await ethers.provider.send("evm_mine", []);

			// Attempt to claim more than the available amount
			const excessiveClaimAmount = ethers.utils.parseEther("200");
			await expect(vMATR.connect(user).claim(excessiveClaimAmount))
				.to.be.revertedWithCustomError(vMATR, "GivenAmountIsTooBig");
		});

		it("Should not allow claiming before distribution start time", async function () {
			// Attempt to claim tokens before the start time
			const claimAmount = ethers.utils.parseEther("10");
			await expect(vMATR.connect(user).claim(claimAmount))
				.to.be.revertedWithCustomError(vMATR, "VestingNotStarted");
		});
	});
	describe("Token Transfer", function () {
		beforeEach(async function () {
			const now = (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp;

			const startTime = now + 3600; // 1 hour from now
			await vMATR.connect(admin).setStartTime(startTime);

			// Whitelist user for transfers
			await vMATR.setAcceptedToken(MATR.address);
			await vMATR.addWhitelistedAddress(await user.getAddress());
			await vMATR.addWhitelistedAddress(await admin.getAddress());

			// Mint vMATR tokens to the user for transfer
			const mintAmount = ethers.utils.parseEther("50");
			await MATR.connect(admin).approve(vMATR.address, mintAmount);
			await vMATR.connect(admin).deposit(mintAmount);
			await vMATR.connect(admin).transfer(await user.getAddress(), mintAmount);
		});

		it("Should allow whitelisted address to transfer tokens", async function () {
			const transferAmount = ethers.utils.parseEther("10");
			await expect(vMATR.connect(user).transfer(await otherAccount.getAddress(), transferAmount))
				.to.emit(vMATR, 'Transfer')
				.withArgs(await user.getAddress(), await otherAccount.getAddress(), transferAmount);

			// Check final balances
			const userFinalBalance = await vMATR.balanceOf(await user.getAddress());
			const otherFinalBalance = await vMATR.balanceOf(await otherAccount.getAddress());
			expect(userFinalBalance).to.equal(ethers.utils.parseEther("40"));
			expect(otherFinalBalance).to.equal(transferAmount);
		});

		it("Should not allow non-whitelisted address to transfer tokens", async function () {
			const transferAmount = ethers.utils.parseEther("10");
			await expect(vMATR.connect(otherAccount).transfer(await user.getAddress(), transferAmount))
				.to.be.revertedWithCustomError(vMATR, "OnlyWhitelistedTransfer");
		});

		it("Should not allow transferring more tokens than balance", async function () {
			const excessiveTransferAmount = ethers.utils.parseEther("100");
			await expect(vMATR.connect(user).transfer(await otherAccount.getAddress(), excessiveTransferAmount))
				.to.be.revertedWith("ERC20: transfer amount exceeds balance");
		});

		// Test for transferring tokens when the contract is paused
		it("Should not allow transfers when contract is paused", async function () {
			await vMATR.connect(admin).pause();

			const transferAmount = ethers.utils.parseEther("10");
			await expect(vMATR.connect(user).transfer(await otherAccount.getAddress(), transferAmount))
				.to.be.revertedWith("ERC20Pausable: token transfer while paused");

			// Unpause for other tests
			await vMATR.connect(admin).unpause();
		});
	});

	describe("Pause and Unpause", function () {
		let pauser: Signer;
		beforeEach(async function () {
			pauser = admin;
		});

		it("Should allow pauser to pause the contract", async function () {
			await expect(vMATR.connect(pauser).pause())
				.to.emit(vMATR, 'Paused')
				.withArgs(await pauser.getAddress());
			expect(await vMATR.paused()).to.be.true;
		});

		it("Should prevent non-pausers from pausing the contract", async function () {
			await expect(vMATR.connect(user).pause())
				.to.be.revertedWith(`AccessControl: account ${(await user.getAddress()).toLowerCase()} is missing role ${pauser_role}`);
		});

		it("Should allow pauser to unpause the contract", async function () {
			await vMATR.connect(pauser).pause();
			await expect(vMATR.connect(pauser).unpause())
				.to.emit(vMATR, 'Unpaused')
				.withArgs(await pauser.getAddress());
			expect(await vMATR.paused()).to.be.false;
		});

		it("Should prevent non-pausers from unpausing the contract", async function () {
			await vMATR.connect(pauser).pause();
			await expect(vMATR.connect(user).unpause())
				.to.be.revertedWith(`AccessControl: account ${(await user.getAddress()).toLowerCase()} is missing role ${pauser_role}`);
		});
	});
	describe("Token Claiming", function () {
		beforeEach(async function () {
			const now = (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp;

			const startTime = now + 3600; // 1 hour from now
			await vMATR.connect(admin).setStartTime(startTime);

			await vMATR.setAcceptedToken(MATR.address);
			await vMATR.addWhitelistedAddress(await user.getAddress());
			await vMATR.addWhitelistedAddress(await admin.getAddress());

			// Forward time to enable claiming
			await ethers.provider.send("evm_increaseTime", [3600]); // Fast forward 1 hour
			await ethers.provider.send("evm_mine", []);

			// Mint vMATR tokens to the user for claiming
			const mintAmount = ethers.utils.parseEther("50");
			await MATR.connect(admin).approve(vMATR.address, mintAmount);
			await vMATR.connect(admin).deposit(mintAmount);
			await vMATR.connect(admin).transfer(await user.getAddress(), mintAmount);
		});

		it("Should allow users to claim tokens", async function () {
			const claimAmount = ethers.utils.parseEther("1");
			await expect(vMATR.connect(user).claim(claimAmount))
				.to.emit(vMATR, 'Claim')
				.withArgs(await user.getAddress(), claimAmount);

			// Additional balance checks
			const userBalance = await MATR.balanceOf(await user.getAddress());
			expect(userBalance).to.be.at.least(claimAmount);
		});

		it("Should revert if claiming more than available", async function () {
			const excessiveClaimAmount = ethers.utils.parseEther("1000");
			await expect(vMATR.connect(user).claim(excessiveClaimAmount))
				.to.be.revertedWithCustomError(vMATR, "GivenAmountIsTooBig");
		});

		it.skip("Should revert if claiming before distribution start time", async function () {
			const claimAmount = ethers.utils.parseEther("10");
			await expect(vMATR.connect(user).claim(claimAmount))
				.to.be.revertedWithCustomError(vMATR, "VestingNotStarted");
		});

		it("Should update user's token balance correctly after claiming", async function () {
			const claimAmount = ethers.utils.parseEther("1");
			await vMATR.connect(user).claim(claimAmount);

			const userTokenBalance = await vMATR.balanceOf(await user.getAddress());
			expect(userTokenBalance).to.equal(ethers.utils.parseEther("49")); // Assuming they had 50 initially
		});

		it("Should allow users to successfully claim the maximum amount", async function () {
			const initialUserBalance = await vMATR.balanceOf(await user.getAddress());

			const claimableAmountBefore = await vMATR.getClaimableAmount(await user.getAddress());

			await expect(vMATR.connect(user).claimMaximumAmount())
				.to.emit(vMATR, 'Claim')
				.withArgs(await user.getAddress(), claimableAmountBefore);

			const userBalanceAfter = await vMATR.balanceOf(await user.getAddress());
			const expectedBalanceAfter = initialUserBalance.sub(claimableAmountBefore);
			expect(userBalanceAfter).to.equal(expectedBalanceAfter);

			await expect(vMATR.connect(user).claimMaximumAmount())
				.to.be.revertedWithCustomError(vMATR, "NoClaimableAmount");
		});
	});

	describe("Token Burning", function () {
		beforeEach(async function () {
			const now = (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp;

			const startTime = now + 3600; // 1 hour from now
			await vMATR.connect(admin).setStartTime(startTime);

			await vMATR.setAcceptedToken(MATR.address);
			await vMATR.addWhitelistedAddress(await user.getAddress());
			await vMATR.addWhitelistedAddress(await admin.getAddress());

			const mintAmount = ethers.utils.parseEther("100");
			await MATR.connect(admin).approve(vMATR.address, mintAmount);
			await vMATR.connect(admin).deposit(mintAmount);
			await vMATR.connect(admin).transfer(await user.getAddress(), mintAmount);
		});

		it("Should allow users to burn their tokens", async function () {
			const burnAmount = ethers.utils.parseEther("10");
			await expect(vMATR.connect(user).burn(burnAmount))
				.to.emit(vMATR, 'Transfer')
				.withArgs(await user.getAddress(), ethers.constants.AddressZero, burnAmount);

			// Additional balance and total supply checks
			const userBalanceAfterBurn = await vMATR.balanceOf(await user.getAddress());
			expect(userBalanceAfterBurn).to.equal(ethers.utils.parseEther("90"));
			const totalSupplyAfterBurn = await vMATR.totalSupply();
			expect(totalSupplyAfterBurn).to.equal(ethers.utils.parseEther("90"));
		});

		it("Should allow a spender to burn tokens on behalf of owner", async function () {
			const burnAmount = ethers.utils.parseEther("5");
			const tokensOwner = await user.getAddress();
			const spender = await otherAccount.getAddress();

			// Set allowance for spender
			await vMATR.connect(user).approve(spender, burnAmount);
			await expect(vMATR.connect(otherAccount).burnFrom(tokensOwner, burnAmount))
				.to.emit(vMATR, 'Transfer')
				.withArgs(tokensOwner, ethers.constants.AddressZero, burnAmount);

			// Additional balance and allowance checks
			const userBalanceAfterBurn = await vMATR.balanceOf(tokensOwner);
			expect(userBalanceAfterBurn).to.equal(ethers.utils.parseEther("95"));
			const allowanceAfterBurn = await vMATR.allowance(tokensOwner, spender);
			expect(allowanceAfterBurn).to.equal(0); // Allowance should be zero after burning
		});

		it("Should not allow burning more tokens than owned", async function () {
			const excessiveBurnAmount = ethers.utils.parseEther("200"); // More than the user owns
			await expect(vMATR.connect(user).burn(excessiveBurnAmount))
				.to.be.revertedWith("ERC20: burn amount exceeds balance");
		});

		it("Should not allow burning without sufficient allowance", async function () {
			const burnAmount = ethers.utils.parseEther("5");
			const tokensOwner = await user.getAddress();
			const spender = await otherAccount.getAddress();

			// Set insufficient allowance for spender
			await vMATR.connect(user).approve(spender, ethers.utils.parseEther("1")); // Less than burnAmount
			await expect(vMATR.connect(otherAccount).burnFrom(tokensOwner, burnAmount))
				.to.be.revertedWith("ERC20: insufficient allowance");
		});
	});
});
