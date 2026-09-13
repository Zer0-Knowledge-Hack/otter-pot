// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  ChallengePool
/// @notice Escrow for social challenges funded in USDC, ported from the
///         Arbitrum Stylus (Rust) implementation in `packages/stylus` so it can
///         be deployed on Arc, Circle's EVM L1.
/// @dev    Arc uses USDC as its native gas token behind a dual interface over a
///         single balance: the native interface (`msg.value`, `address.balance`)
///         is 18 decimals while the ERC-20 interface (`balanceOf`, `transfer`,
///         `transferFrom`) is 6 decimals. This contract only ever speaks the
///         ERC-20 interface: no function is payable, `msg.value` and
///         `address(this).balance` are never read, and every amount in storage
///         is denominated in 6-decimal USDC units. There is no wrapped USDC —
///         the ERC-20 USDC address is the pool token.
///
///         Differences from the Stylus version, all deliberate:
///         - The TreasuryVault (yield routing) is cut. Funds simply stay in this
///           contract between deposit and payout, which removes every external
///           call failure mode. `ChallengeLocked` keeps its name and shape but
///           its second field is now the total pooled amount, not vault shares.
///         - A constructor replaces the one-shot `init`, removing the
///           uninitialized window.
///         - `MAX_DEPOSIT` is denominated in USDC units (see below).
///         - The per-participant refund has its own storage field instead of
///           overloading the vault-shares slot.
///         - `createChallenge` rejects duplicate and zero-address participants,
///           which would otherwise strand every deposit of the challenge.
///         - The commission rate is snapshotted per challenge at creation, so
///           the owner cannot raise it against an already-Locked pool.
contract ChallengePool {
    // ── Errors ───────────────────────────────────────────────────────────────

    error NotOwner();
    error NotAnOperator();
    error NotAParticipant();
    error AlreadyDeposited();
    error ChallengeNotOpen();
    error ChallengeNotLocked();
    error WinnerIsZeroAddress();
    error WinnerNotParticipant();
    error DeadlineNotReached();
    error NotRefunded();
    error AlreadyClaimed();
    error NoParticipants();
    error DuplicateParticipant();
    error ParticipantIsZeroAddress();
    error ZeroDeposit();
    error DepositExceedsMaximum();
    error OperatorIsZeroAddress();
    error TransferFailed();
    error Reentrancy();

    // ── Events ───────────────────────────────────────────────────────────────

    event ChallengeCreated(
        uint256 indexed challengeId, address indexed creator, uint256 requiredDeposit, uint256 deadline
    );

    event DepositReceived(uint256 indexed challengeId, address indexed participant, uint256 amount);

    /// @notice Emitted when the last participant funds a challenge.
    /// @param  totalPooled  Total USDC now held by this contract for the
    ///         challenge. In the Stylus version this field carried the
    ///         TreasuryVault shares minted for the pool; with the vault removed
    ///         it carries the pooled amount itself.
    event ChallengeLocked(uint256 indexed challengeId, uint256 totalPooled);

    event ChallengeResolved(
        uint256 indexed challengeId, address indexed winner, uint256 totalPayout, uint256 commission
    );

    event ChallengeRefunded(uint256 indexed challengeId, uint256 refundPerParticipant);

    event RefundClaimed(uint256 indexed challengeId, address indexed participant, uint256 amount);

    event OperatorAdded(address indexed operator);
    event OperatorRemoved(address indexed operator);
    event CommissionRateUpdated(uint256 indexed previousRate, uint256 indexed newRate);

    // ── Constants ────────────────────────────────────────────────────────────

    /// @notice Challenge states. The numeric values match the Stylus contract so
    ///         the worker's `challengeStatus` mapping stays valid.
    uint8 public constant STATE_OPEN = 0;
    uint8 public constant STATE_LOCKED = 1;
    uint8 public constant STATE_RESOLVED = 2;
    uint8 public constant STATE_REFUNDED = 3;

    /// @notice Basis-point denominator: 10_000 bps = 100 %.
    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @notice Maximum deposit per participant: 10,000 USDC.
    /// @dev    The Stylus source used `MAX_DEPOSIT_WEI = 10e18`, described as
    ///         "10 ETH in wei". Deposits are USDC with 6 decimals, so that cap
    ///         amounted to 10 trillion USDC and was inert — it could never
    ///         reject a realistic deposit. This constant is denominated in USDC
    ///         units instead, so the cap actually binds.
    uint256 public constant MAX_DEPOSIT = 10_000e6;

    // ── Storage ──────────────────────────────────────────────────────────────

    struct Challenge {
        address creator;
        address winner;
        uint8 status;
        uint256 requiredDeposit;
        uint256 deadline;
        /// @dev Total USDC held for this challenge once every participant funded.
        uint256 pooled;
        /// @dev Per-participant payout after a refund. The Stylus version reused
        ///      the `treasury_shares` slot for this; it gets its own field here.
        uint256 refundPerParticipant;
        /// @dev Commission rate in bps, snapshotted at creation. `confirmResult`
        ///      reads this and never the live global, so changing the global
        ///      rate cannot alter the economics of an existing challenge.
        uint256 commissionRateBps;
        uint256 participantCount;
        uint256 depositedCount;
        mapping(address => bool) participants;
        mapping(address => bool) hasDeposited;
        mapping(address => bool) claimedRefund;
    }

    mapping(uint256 => Challenge) internal _challenges;

    /// @notice Next challenge id to be assigned. Ids are monotonic from 0.
    uint256 public nextChallengeId;

    /// @notice USDC (ERC-20, 6 decimals) used for every deposit and payout.
    address public immutable usdc;

    /// @notice Contract owner / admin.
    address public owner;

    /// @notice Commission rate in basis points (e.g. 500 = 5 %).
    uint256 public baseCommissionRate;

    mapping(address => bool) internal _operators;

    uint256 private _reentrancyGuard = 1;

    // ── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyOperator() {
        if (!_operators[msg.sender]) revert NotAnOperator();
        _;
    }

    /// @dev Minimal inline reentrancy guard for the functions that move funds.
    modifier nonReentrant() {
        if (_reentrancyGuard != 1) revert Reentrancy();
        _reentrancyGuard = 2;
        _;
        _reentrancyGuard = 1;
    }

    // ── Construction ─────────────────────────────────────────────────────────

    /// @param usdcToken           USDC (ERC-20) address participants approve.
    /// @param baseCommissionRate_ Commission rate in basis points (500 = 5 %).
    constructor(address usdcToken, uint256 baseCommissionRate_) {
        usdc = usdcToken;
        baseCommissionRate = baseCommissionRate_;
        owner = msg.sender;
    }

    // ── Admin ────────────────────────────────────────────────────────────────

    /// @notice Authorize an operator (the Cloudflare Worker account). Owner-only.
    function addOperator(address operator) external onlyOwner {
        if (operator == address(0)) revert OperatorIsZeroAddress();
        _operators[operator] = true;
        emit OperatorAdded(operator);
    }

    /// @notice Revoke an operator. Owner-only.
    function removeOperator(address operator) external onlyOwner {
        _operators[operator] = false;
        emit OperatorRemoved(operator);
    }

    /// @notice Update the commission rate in basis points. Owner-only.
    /// @dev    Only affects challenges created after this call: every challenge
    ///         snapshots the rate at creation, so the owner cannot raise the
    ///         rate against an already-Locked pool and take more of it.
    function setCommissionRate(uint256 rateBps) external onlyOwner {
        uint256 previousRate = baseCommissionRate;
        baseCommissionRate = rateBps;
        emit CommissionRateUpdated(previousRate, rateBps);
    }

    // ── Challenge lifecycle ──────────────────────────────────────────────────

    /// @notice Create a challenge in state Open.
    /// @param  requiredDeposit Exact USDC (6 decimals) each participant deposits.
    /// @param  deadline        Unix timestamp after which a refund is allowed.
    /// @param  participants    Participant addresses. Must contain no duplicate
    ///         and no zero address: a repeated address would inflate
    ///         `participantCount` with no matching depositor, so the challenge
    ///         could never reach Locked and — since `refund` requires Locked —
    ///         every deposit would be stuck permanently.
    /// @return challengeId     Monotonically increasing identifier.
    /// @dev    The current commission rate is snapshotted into the challenge
    ///         here; later `setCommissionRate` calls only affect challenges
    ///         created afterwards.
    function createChallenge(uint256 requiredDeposit, uint256 deadline, address[] calldata participants)
        external
        returns (uint256 challengeId)
    {
        if (participants.length == 0) revert NoParticipants();
        if (requiredDeposit == 0) revert ZeroDeposit();
        if (requiredDeposit > MAX_DEPOSIT) revert DepositExceedsMaximum();

        challengeId = nextChallengeId;
        nextChallengeId = challengeId + 1;

        Challenge storage c = _challenges[challengeId];
        c.creator = msg.sender;
        c.requiredDeposit = requiredDeposit;
        c.deadline = deadline;
        c.status = STATE_OPEN;
        c.participantCount = participants.length;
        c.commissionRateBps = baseCommissionRate;

        // O(n^2) duplicate scan. Challenge rosters are small, and the mapping
        // cannot be used for the check because a challenge id is fresh here:
        // reading it back would be the same cost with more room for error.
        for (uint256 i = 0; i < participants.length; i++) {
            address participant = participants[i];
            if (participant == address(0)) revert ParticipantIsZeroAddress();
            for (uint256 j = 0; j < i; j++) {
                if (participants[j] == participant) revert DuplicateParticipant();
            }
            c.participants[participant] = true;
        }

        emit ChallengeCreated(challengeId, msg.sender, requiredDeposit, deadline);
    }

    /// @notice Deposit USDC for a challenge. The caller must have approved this
    ///         contract for `requiredDeposit`. Non-payable: Arc's native
    ///         interface is never used.
    /// @dev    When the last participant deposits the challenge moves to Locked
    ///         and `ChallengeLocked` carries the total pooled amount. Funds stay
    ///         in this contract until resolution or refund.
    function deposit(uint256 challengeId) external nonReentrant {
        Challenge storage c = _challenges[challengeId];

        if (c.status != STATE_OPEN) revert ChallengeNotOpen();
        if (!c.participants[msg.sender]) revert NotAParticipant();
        if (c.hasDeposited[msg.sender]) revert AlreadyDeposited();

        uint256 amount = c.requiredDeposit;

        // CEI: state is written before the external call.
        c.hasDeposited[msg.sender] = true;
        uint256 newDepositedCount = c.depositedCount + 1;
        c.depositedCount = newDepositedCount;

        bool locked = newDepositedCount == c.participantCount;
        uint256 pooledAmount;
        if (locked) {
            pooledAmount = amount * c.participantCount;
            c.status = STATE_LOCKED;
            c.pooled = pooledAmount;
        }

        emit DepositReceived(challengeId, msg.sender, amount);
        if (locked) emit ChallengeLocked(challengeId, pooledAmount);

        _safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Relay a consensus winner and resolve a challenge. Operator-only.
    /// @dev    The winner must be a registered participant: the operator relays
    ///         a decision already taken, it does not choose the destination of
    ///         the funds. The commission is withheld but, as in the Stylus
    ///         version, never transferred out — it simply accrues in this
    ///         contract's USDC balance. No withdrawal function exists yet.
    function confirmResult(uint256 challengeId, address winner) external onlyOperator nonReentrant {
        Challenge storage c = _challenges[challengeId];

        if (c.status != STATE_LOCKED) revert ChallengeNotLocked();
        if (winner == address(0)) revert WinnerIsZeroAddress();
        if (!c.participants[winner]) revert WinnerNotParticipant();

        uint256 total = c.pooled;
        uint256 commission = (total * c.commissionRateBps) / BPS_DENOMINATOR;
        uint256 payout = total - commission;

        // CEI: terminal state before the transfer.
        c.status = STATE_RESOLVED;
        c.winner = winner;

        emit ChallengeResolved(challengeId, winner, payout, commission);

        if (payout > 0) _safeTransfer(winner, payout);
    }

    /// @notice Refund a challenge that passed its deadline without a result.
    /// @dev    Permissionless. No commission is taken. Participants then call
    ///         `claimRefund` individually.
    function refund(uint256 challengeId) external {
        Challenge storage c = _challenges[challengeId];

        if (c.status != STATE_LOCKED) revert ChallengeNotLocked();
        if (block.timestamp <= c.deadline) revert DeadlineNotReached();

        uint256 perParticipant = c.pooled / c.participantCount;

        c.status = STATE_REFUNDED;
        c.refundPerParticipant = perParticipant;

        emit ChallengeRefunded(challengeId, perParticipant);
    }

    /// @notice Claim a proportional refund. Once per participant.
    function claimRefund(uint256 challengeId) external nonReentrant {
        Challenge storage c = _challenges[challengeId];

        if (c.status != STATE_REFUNDED) revert NotRefunded();
        if (!c.participants[msg.sender]) revert NotAParticipant();
        if (c.claimedRefund[msg.sender]) revert AlreadyClaimed();

        uint256 amount = c.refundPerParticipant;

        // CEI: mark claimed before the transfer.
        c.claimedRefund[msg.sender] = true;

        emit RefundClaimed(challengeId, msg.sender, amount);

        if (amount > 0) _safeTransfer(msg.sender, amount);
    }

    // ── Views ────────────────────────────────────────────────────────────────

    /// @notice Current status byte: 0 Open, 1 Locked, 2 Resolved, 3 Refunded.
    function challengeStatus(uint256 challengeId) external view returns (uint8) {
        return _challenges[challengeId].status;
    }

    /// @notice True when `operator` is authorized.
    function isOperator(address operator) external view returns (bool) {
        return _operators[operator];
    }

    /// @notice Current global commission rate in basis points, applied to
    ///         challenges created from now on.
    function commissionRate() external view returns (uint256) {
        return baseCommissionRate;
    }

    /// @notice Commission rate in basis points snapshotted for a challenge when
    ///         it was created. This is the rate `confirmResult` actually uses.
    function challengeCommissionRate(uint256 challengeId) external view returns (uint256) {
        return _challenges[challengeId].commissionRateBps;
    }

    /// @notice Total USDC pooled for a challenge once it is locked.
    function totalPooled(uint256 challengeId) external view returns (uint256) {
        return _challenges[challengeId].pooled;
    }

    /// @notice Amount each participant may claim after a refund.
    function refundPerParticipant(uint256 challengeId) external view returns (uint256) {
        return _challenges[challengeId].refundPerParticipant;
    }

    /// @notice Challenge metadata, excluding the per-address mappings.
    function challengeInfo(uint256 challengeId)
        external
        view
        returns (
            address creator,
            address winner,
            uint8 status,
            uint256 requiredDeposit,
            uint256 deadline,
            uint256 participantCount,
            uint256 depositedCount
        )
    {
        Challenge storage c = _challenges[challengeId];
        return (c.creator, c.winner, c.status, c.requiredDeposit, c.deadline, c.participantCount, c.depositedCount);
    }

    /// @notice True when `account` is registered in the challenge.
    function isParticipant(uint256 challengeId, address account) external view returns (bool) {
        return _challenges[challengeId].participants[account];
    }

    /// @notice True when `account` already funded the challenge.
    function hasDeposited(uint256 challengeId, address account) external view returns (bool) {
        return _challenges[challengeId].hasDeposited[account];
    }

    /// @notice True when `account` already claimed its refund.
    function hasClaimedRefund(uint256 challengeId, address account) external view returns (bool) {
        return _challenges[challengeId].claimedRefund[account];
    }

    // ── Internal ERC-20 helpers ──────────────────────────────────────────────

    /// @dev USDC deployments may return no data from `transfer`/`transferFrom`.
    ///      Accept an empty return or an explicit `true`; anything else reverts.
    ///      Written by hand on purpose: this package builds with no external
    ///      dependencies.
    function _safeTransfer(address to, uint256 amount) internal {
        _callToken(abi.encodeWithSelector(0xa9059cbb, to, amount)); // transfer(address,uint256)
    }

    function _safeTransferFrom(address from, address to, uint256 amount) internal {
        _callToken(abi.encodeWithSelector(0x23b872dd, from, to, amount)); // transferFrom(address,address,uint256)
    }

    function _callToken(bytes memory data) private {
        (bool ok, bytes memory returndata) = usdc.call(data);
        if (!ok) revert TransferFailed();
        if (returndata.length != 0 && !abi.decode(returndata, (bool))) revert TransferFailed();
    }
}
