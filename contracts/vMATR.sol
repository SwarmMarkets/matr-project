// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.19;

import {IERC20, ERC20, ERC20Pausable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title Interface for ERC20 Burnable Token
interface IERC20Burnable is IERC20 {
    /**
     * @dev Destroys `amount` tokens from the caller, reducing the total supply.
     * @param amount The amount of tokens to burn.
     */
    function burn(uint256 amount) external;
}

/**
 * @title MATR Vesting Contract
 * @notice Contract module used to lock MATR tokens during the vesting period. It allows for time-based vesting and token claims.
 * @dev Inherits from AccessControl for role-based permissions, and ERC20Pausable for pause functionality. The contract uses SafeERC20 for safe token transfers.
 */
contract vMATR is AccessControl, ERC20Pausable {
    using SafeERC20 for IERC20Burnable;

    /// @notice Custom error for zero address operations.
    error ZeroAddressPasted();

    /// @notice Custom error for invalid start time operations.
    error InvalidStartTime(uint256 currentStartTime);

    /// @notice Custom error for setting a start time that is not in the future.
    error StartTimeMustBeGreaterThanCurrent(uint256 givenStartTime);

    /// @notice Custom error when distribution start time is not set.
    error DistributionStartTimeIsNotSet();

    /// @notice Custom error when the given claim amount exceeds the allowable limit.
    error GivenAmountIsTooBig(uint256 requiredAmount, uint256 givenAmount);

    /// @notice Custom error when there is no claimable amount available.
    error NoClaimableAmount();

    /// @notice Custom error when vesting has not started.
    error VestingNotStarted();

    /// @notice Custom error for transfers by non-whitelisted addresses.
    error OnlyWhitelistedTransfer();

    /// @notice Custom error for removing an invalid address from the whitelist.
    error InvalidAddressToRemove(address toRemove);

    /// @notice Role identifier for pausers.
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    /// @notice Multiplier constants for vesting calculation.
    uint256 private constant VESTING_TIME = 20 days;

    /// @notice ERC20 token contract being held.
    IERC20Burnable public acceptedToken;

    /// @notice Distribution start timestamp.
    uint256 public distributionStartTime;

    /// @notice KYA (Know Your Asset) information.
    string public kya;

    /// @notice Whitelist for transferable addresses.
    mapping(address => bool) public whitelisted;

    /// @notice Record of claim amounts.
    mapping(address => uint256) public claimings;

    /// @notice Vesting multipliers.
    mapping(uint256 => uint256) public multiplier;

    /// @notice Emitted when a user claims tokens.
    event Claim(address indexed owner, uint256 amount);

    /// @notice Emitted when accepted token is set.
    event AcceptedTokenSet(address _acceptedToken);

    /// @notice Emitted when distribution start time is set.
    event StartTimeSet(uint256 startTime);

    /// @notice Emitted when an address is added to the whitelist.
    event WhitelistedAddressAdded(address whitelisted);

    /// @notice Emitted when an address is removed from the whitelist.
    event WhitelistedAddressRemoved(address removed);

    /// @notice Emitted when KYA information is set.
    event KYAset(string kya);

    /// @dev Modifier to check for zero address input.
    modifier zeroAddressCheck(address _address) {
        if (_address == address(0)) {
            revert ZeroAddressPasted();
        }
        _;
    }

    /// @dev Modifier to ensure distribution time is set.
    modifier isDistributionTimeSet() {
        if (distributionStartTime == 0) {
            revert DistributionStartTimeIsNotSet();
        }
        _;
    }

    /**
     * @dev Sets up roles and initializes the contract.
     * Grants `DEFAULT_ADMIN_ROLE` and `PAUSER_ROLE` to the deployer.
     */
    constructor() ERC20("vMATR", "vMATR") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);

        for (uint8 i = 0; i < 10; ) {
            multiplier[i] = i + 1;
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @dev Sets the accepted ERC20 token for vesting.
     * @param _token The address of the ERC20 token to be accepted.
     */
    function setAcceptedToken(
        address _token
    ) external onlyRole(DEFAULT_ADMIN_ROLE) zeroAddressCheck(_token) {
        acceptedToken = IERC20Burnable(_token);
        emit AcceptedTokenSet(_token);
    }

    /**
     * @dev Deposits a specific amount of the accepted token for vesting.
     * @param _amount The amount of tokens to deposit.
     */
    function deposit(uint256 _amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _mint(msg.sender, _amount);
        acceptedToken.safeTransferFrom(msg.sender, address(this), _amount);
    }

    /**
     * @dev Sets the KYA information.
     * @param _knowYourAsset The KYA string.
     */
    function setKYA(
        string calldata _knowYourAsset
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        kya = _knowYourAsset;
        emit KYAset(_knowYourAsset);
    }

    /**
     * @dev Adds an address to the transfer whitelist.
     * @param _address The address to whitelist.
     */
    function addWhitelistedAddress(
        address _address
    ) external onlyRole(DEFAULT_ADMIN_ROLE) zeroAddressCheck(_address) {
        whitelisted[_address] = true;
        emit WhitelistedAddressAdded(_address);
    }

    /**
     * @dev Removes an address from the transfer whitelist.
     * @param _address The address to remove from the whitelist.
     */
    function removeWhitelistedAddress(
        address _address
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (whitelisted[_address] == false) {
            revert InvalidAddressToRemove(_address);
        }

        whitelisted[_address] = false;
        emit WhitelistedAddressRemoved(_address);
    }

    /**
     * @dev Sets the distribution start time for vesting.
     * @param startTime The start time as a Unix timestamp.
     */
    function setStartTime(
        uint256 startTime
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (
            (distributionStartTime != 0 && startTime > distributionStartTime) ||
            startTime < block.timestamp
        ) {
            revert InvalidStartTime(startTime);
        }

        if (distributionStartTime != startTime) {
            distributionStartTime = startTime;
            emit StartTimeSet(startTime);
        }
    }

    /**
     * @dev Pauses all token transfers.
     * This function can only be called by accounts with the `PAUSER_ROLE`.
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @dev Unpauses all token transfers.
     * This function can only be called by accounts with the `PAUSER_ROLE`.
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @dev Burns a specific amount of vMATR tokens and releases equivalent balance of acceptedToken.
     * @param amount The amount of vMATR tokens to burn.
     */
    function claim(uint256 amount) external {
        uint requiredAmount = getClaimableAmount(msg.sender);
        if (requiredAmount < amount) {
            revert GivenAmountIsTooBig(requiredAmount, amount);
        }

        _claim(amount);
    }

    /**
     * @dev Burns a specific amount of vMATR tokens.
     * @param amount The amount of vMATR tokens to burn.
     */
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
        acceptedToken.burn(amount);
    }

    /**
     * @dev Burns a specific amount of vMATR tokens from a given account.
     * @param tokensOwner The owner of the tokens to burn.
     * @param amount The amount of vMATR tokens to burn.
     */
    function burnFrom(address tokensOwner, uint256 amount) external {
        _spendAllowance(tokensOwner, msg.sender, amount);
        _burn(tokensOwner, amount);
        acceptedToken.burn(amount);
    }

    /**
     * @dev Claims the maximum available amount from the caller's holdings.
     */
    function claimMaximumAmount() external {
        uint256 requiredAmount = getClaimableAmount(msg.sender);
        if (requiredAmount == 0) {
            revert NoClaimableAmount();
        }

        _claim(requiredAmount);
    }

    /**
     * @dev Calculates the claimable amount for a specific address.
     * @param awarded The address to calculate the claimable amount for.
     * @return amount The claimable amount for the address.
     */
    function getClaimableAmount(
        address awarded
    ) public view isDistributionTimeSet returns (uint256 amount) {
        uint256 current = currentVestingPeriodSinceStartTime();
        uint256 _claimings = claimings[awarded];
        uint256 balanceOnAuction = balanceOf(awarded) + _claimings;

        if (current < 10) {
            return ((balanceOnAuction * multiplier[current]) / 10) - _claimings;
        } else {
            return balanceOf(awarded);
        }
    }

    /**
     * @notice Calculates the number of vesting periods that have passed since the distribution start time.
     * @dev Calculates the elapsed vesting periods based on the `distributionStartTime` and `VESTING_TIME`.
     * @return currentQuarter The number of elapsed vesting periods since the distribution start time.
     * @custom:error VestingNotStarted Thrown if the current timestamp is before the `distributionStartTime`.
     */
    function currentVestingPeriodSinceStartTime()
        public
        view
        isDistributionTimeSet
        returns (uint256 currentQuarter)
    {
        uint256 startTime = distributionStartTime;

        if (startTime > block.timestamp) {
            revert VestingNotStarted();
        }

        return (block.timestamp - startTime) / VESTING_TIME;
    }

    /**
     * @notice Retrieves the total amount of the accepted token currently locked in the contract.
     * @dev Returns the balance of the accepted token (`acceptedToken`) held by this contract.
     *      This amount should always be equal to the total supply of the vMATR token.
     * @return balanceOfAcceptedToken The total amount of the accepted token currently locked in this contract.
     */
    function getCurrentLockedAmount()
        external
        view
        returns (uint256 balanceOfAcceptedToken)
    {
        balanceOfAcceptedToken = acceptedToken.balanceOf(address(this));
    }

    /**
     * @notice Enforces transfer restrictions, allowing only whitelisted addresses to transfer tokens.
     * @dev Overrides `_beforeTokenTransfer` to include whitelist checks. Allows minting and burning by default.
     * @param from The address transferring the tokens.
     * @param to The address receiving the tokens.
     * @param amount The amount of tokens being transferred.
     * @custom:error OnlyWhitelistedTransfer Thrown if the sender is not whitelisted for transfers.
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override {
        super._beforeTokenTransfer(from, to, amount);

        // Allow minting and burning
        if (from == address(0) || to == address(0)) {
            return;
        }

        if (!whitelisted[from]) {
            revert OnlyWhitelistedTransfer();
        }
    }

    /**
     * @notice Internal function to handle claims of the accepted token by burning vMATR tokens.
     * @dev Burns `amount` of vMATR tokens from the caller's balance and transfers the same amount of accepted tokens.
     *      Also updates the `claimings` state to reflect the claimed amount.
     * @param amount The amount of vMATR tokens to burn and the equivalent amount of accepted tokens to claim.
     */
    function _claim(uint256 amount) internal {
        claimings[msg.sender] += amount;
        _burn(msg.sender, amount);

        acceptedToken.safeTransfer(msg.sender, amount);

        emit Claim(msg.sender, amount);
    }
}
