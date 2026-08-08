// SPDX-License-Identifier: MIT
// Solidity interface for ChallengePool (Arbitrum Stylus / Rust)
// Manually derived from src/lib.rs — kept in sync with SDD §6 & §7.
//
// Run `cargo stylus export-abi` from the WSL environment (wasm32 target)
// to regenerate this interface automatically.
pragma solidity ^0.8.24;

interface IChallengePool {

    // ── Events ────────────────────────────────────────────────────────────────

    event ChallengeCreated(
        uint256 indexed challengeId,
        address indexed creator,
        uint256 requiredDeposit,
        uint256 deadline
    );

    event DepositReceived(
        uint256 indexed challengeId,
        address indexed participant,
        uint256 amount
    );

    event ChallengeLocked(
        uint256 indexed challengeId,
        uint256 treasuryShares
    );

    event ChallengeResolved(
        uint256 indexed challengeId,
        address indexed winner,
        uint256 totalPayout,
        uint256 commission
    );

    event ChallengeRefunded(
        uint256 indexed challengeId,
        uint256 refundPerParticipant
    );

    event RefundClaimed(
        uint256 indexed challengeId,
        address indexed participant,
        uint256 amount
    );

    event OperatorAdded(address indexed operator);
    event OperatorRemoved(address indexed operator);

    /// @notice Emitted whenever the commission rate is updated by the owner.
    /// @param  previousRate  Rate in bps that was active before the change.
    /// @param  newRate       Rate in bps now active.
    event CommissionRateUpdated(
        uint256 indexed previousRate,
        uint256 indexed newRate
    );

    // ── Admin / Initialization ────────────────────────────────────────────────

    /// @notice One-shot initializer. Sets owner = msg.sender, USDC and vault.
    ///         Must be called immediately after deployment.
    /// @param  treasuryVault       TreasuryVault contract address (SDD §7).
    /// @param  usdc                USDC (ERC-20) address approved by participants.
    /// @param  baseCommissionRate  Commission rate in basis points (e.g. 500 = 5 %).
    function init(
        address treasuryVault,
        address usdc,
        uint256 baseCommissionRate
    ) external;

    /// @notice Add an authorized operator. Owner-only.
    /// @dev    Operator is the Cloudflare Worker account (SDD §9).
    function addOperator(address operator) external;

    /// @notice Remove an authorized operator. Owner-only.
    function removeOperator(address operator) external;

    /// @notice Update commission rate. Owner-only.
    ///         Emits CommissionRateUpdated.
    /// @param  rateBps  Basis points (100 bps = 1 %).
    function setCommissionRate(uint256 rateBps) external;

    // ── Challenge Lifecycle ───────────────────────────────────────────────────

    /// @notice Create a new challenge in state Abierto.
    /// @param  requiredDeposit  Exact USDC (6 decimals) each participant must deposit.
    /// @param  deadline         Unix timestamp; after this time refund is allowed.
    /// @param  participants     List of participant addresses.
    /// @return challengeId      Monotonically increasing challenge identifier.
    function createChallenge(
        uint256 requiredDeposit,
        uint256 deadline,
        address[] calldata participants
    ) external returns (uint256 challengeId);

    /// @notice Deposit USDC for a challenge. Caller must have approved the pool
    ///         to pull `requiredDeposit`. Non-payable (ERC-20, not native ETH).
    /// @dev    When the last participant deposits, the pool is moved into the
    ///         TreasuryVault (state → Bloqueado) and shares are minted.
    function deposit(uint256 challengeId) external;

    /// @notice Relay a consensus winner and resolve the challenge. Operator-only.
    /// @dev    Transitions Bloqueado → Resuelto, redeems vault shares, applies
    ///         commission on the recovered total and pays USDC to `winner`.
    ///         Commission and yield are calculated by the contract (SDD §8.2).
    function confirmResult(uint256 challengeId, address winner) external;

    /// @notice Refund participants after deadline without consensus.
    /// @dev    Permissionless once deadline has elapsed. No commission (SDD §8.3).
    ///         Redeems the vault and stores a proportional per-participant refund.
    function refund(uint256 challengeId) external;

    /// @notice Claim a proportional refund. Permissionless per participant.
    /// @dev    Only after the challenge was refunded and only once per participant.
    function claimRefund(uint256 challengeId) external;

    // ── View ─────────────────────────────────────────────────────────────────

    /// @notice Returns the current status byte of a challenge.
    ///         0 = Abierto, 1 = Bloqueado, 2 = Resuelto, 3 = Reembolsado.
    function challengeStatus(uint256 challengeId) external view returns (uint8);

    /// @notice Returns true if `operator` is authorized.
    function isOperator(address operator) external view returns (bool);

    /// @notice Returns the current commission rate in basis points.
    function commissionRate() external view returns (uint256);
}
