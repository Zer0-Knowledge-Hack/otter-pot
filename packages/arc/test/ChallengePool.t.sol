// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ChallengePool} from "../src/ChallengePool.sol";
import {MockUSDC, MockUSDCNoReturn, MockUSDCFalseReturn} from "./mocks/MockUSDC.sol";

/// @notice Subset of the Foundry cheatcode interface used by this suite.
/// @dev    This package builds offline, so `forge-std` is not available and the
///         cheatcode interface plus the assertion helpers are declared here.
interface Vm {
    function prank(address sender) external;
    function warp(uint256 timestamp) external;
    function expectRevert(bytes4 revertData) external;
    function label(address account, string calldata newLabel) external;
}

/// @notice Minimal replacement for `forge-std`'s assertions: a failing
///         assertion reverts, which Foundry reports as a failed test.
contract MiniTest {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function assertEq(uint256 a, uint256 b, string memory err) internal pure {
        require(a == b, err);
    }

    function assertEq(address a, address b, string memory err) internal pure {
        require(a == b, err);
    }

    function assertTrue(bool condition, string memory err) internal pure {
        require(condition, err);
    }

    function assertFalse(bool condition, string memory err) internal pure {
        require(!condition, err);
    }
}

contract ChallengePoolTest is MiniTest {
    ChallengePool internal pool;
    MockUSDC internal usdc;

    address internal owner = address(this);
    address internal operator = address(0xA11CE);
    address internal outsider = address(0xBEEF);

    address internal alice = address(0x1);
    address internal bob = address(0x2);
    address internal carol = address(0x3);

    uint256 internal constant DEPOSIT = 25e6; // 25 USDC (6 decimals)
    uint256 internal constant RATE_5_PCT = 500; // bps
    uint256 internal constant DEADLINE = 1_000_000;

    uint8 internal constant OPEN = 0;
    uint8 internal constant LOCKED = 1;
    uint8 internal constant RESOLVED = 2;
    uint8 internal constant REFUNDED = 3;

    function setUp() public {
        usdc = new MockUSDC();
        pool = new ChallengePool(address(usdc), RATE_5_PCT);
        pool.addOperator(operator);

        vm.warp(1);

        address[3] memory people = [alice, bob, carol];
        for (uint256 i = 0; i < people.length; i++) {
            usdc.mint(people[i], 1_000_000e6);
            vm.prank(people[i]);
            usdc.approve(address(pool), type(uint256).max);
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    function _threeParticipants() internal view returns (address[] memory list) {
        list = new address[](3);
        list[0] = alice;
        list[1] = bob;
        list[2] = carol;
    }

    function _createOpen() internal returns (uint256 id) {
        id = pool.createChallenge(DEPOSIT, DEADLINE, _threeParticipants());
    }

    function _createLocked() internal returns (uint256 id) {
        id = _createOpen();
        address[] memory list = _threeParticipants();
        for (uint256 i = 0; i < list.length; i++) {
            vm.prank(list[i]);
            pool.deposit(id);
        }
    }

    // ── 1. Construction & admin ──────────────────────────────────────────────

    function test_ConstructorSetsOwnerUsdcAndRate() public view {
        assertEq(pool.owner(), owner, "owner");
        assertEq(pool.usdc(), address(usdc), "usdc");
        assertEq(pool.commissionRate(), RATE_5_PCT, "rate");
        assertTrue(pool.isOperator(operator), "operator registered");
        assertFalse(pool.isOperator(outsider), "outsider not operator");
    }

    function test_MaxDepositIsDenominatedInUsdcUnits() public view {
        assertEq(pool.MAX_DEPOSIT(), 10_000e6, "max deposit");
    }

    function test_AddOperatorRevertsForNonOwner() public {
        vm.expectRevert(ChallengePool.NotOwner.selector);
        vm.prank(outsider);
        pool.addOperator(outsider);
    }

    function test_RemoveOperatorRevertsForNonOwner() public {
        vm.expectRevert(ChallengePool.NotOwner.selector);
        vm.prank(outsider);
        pool.removeOperator(operator);
    }

    function test_SetCommissionRateRevertsForNonOwner() public {
        vm.expectRevert(ChallengePool.NotOwner.selector);
        vm.prank(outsider);
        pool.setCommissionRate(0);
    }

    function test_OwnerCanAddAndRemoveOperator() public {
        pool.addOperator(outsider);
        assertTrue(pool.isOperator(outsider), "added");
        pool.removeOperator(outsider);
        assertFalse(pool.isOperator(outsider), "removed");
    }

    function test_OwnerCanUpdateCommissionRate() public {
        pool.setCommissionRate(250);
        assertEq(pool.commissionRate(), 250, "updated rate");
    }

    // ── 2. createChallenge ───────────────────────────────────────────────────

    function test_CreateChallengeAssignsMonotonicIdsAndOpenState() public {
        uint256 first = _createOpen();
        uint256 second = _createOpen();
        assertEq(first, 0, "first id");
        assertEq(second, 1, "second id");
        assertEq(pool.challengeStatus(first), OPEN, "status open");
    }

    function test_CreateChallengeRevertsOnEmptyParticipants() public {
        address[] memory empty = new address[](0);
        vm.expectRevert(ChallengePool.NoParticipants.selector);
        pool.createChallenge(DEPOSIT, DEADLINE, empty);
    }

    function test_CreateChallengeRevertsOnZeroDeposit() public {
        vm.expectRevert(ChallengePool.ZeroDeposit.selector);
        pool.createChallenge(0, DEADLINE, _threeParticipants());
    }

    function test_CreateChallengeRevertsAboveMaxDeposit() public {
        vm.expectRevert(ChallengePool.DepositExceedsMaximum.selector);
        pool.createChallenge(10_000e6 + 1, DEADLINE, _threeParticipants());
    }

    function test_CreateChallengeAcceptsExactlyMaxDeposit() public {
        uint256 id = pool.createChallenge(10_000e6, DEADLINE, _threeParticipants());
        assertEq(pool.challengeStatus(id), OPEN, "created at cap");
    }

    /// @notice A repeated address inflates `participantCount` with no matching
    ///         depositor, so the challenge can never reach Locked — and because
    ///         `refund` requires Locked, every deposit would be stuck forever.
    function test_CreateChallengeRevertsOnDuplicateParticipant() public {
        address[] memory list = new address[](3);
        list[0] = alice;
        list[1] = bob;
        list[2] = alice;

        vm.expectRevert(ChallengePool.DuplicateParticipant.selector);
        pool.createChallenge(DEPOSIT, DEADLINE, list);
    }

    function test_CreateChallengeRevertsOnAdjacentDuplicateParticipant() public {
        address[] memory list = new address[](2);
        list[0] = carol;
        list[1] = carol;

        vm.expectRevert(ChallengePool.DuplicateParticipant.selector);
        pool.createChallenge(DEPOSIT, DEADLINE, list);
    }

    function test_CreateChallengeRevertsOnZeroAddressParticipant() public {
        address[] memory list = new address[](3);
        list[0] = alice;
        list[1] = address(0);
        list[2] = bob;

        vm.expectRevert(ChallengePool.ParticipantIsZeroAddress.selector);
        pool.createChallenge(DEPOSIT, DEADLINE, list);
    }

    function test_CreateChallengeAcceptsSingleParticipant() public {
        address[] memory list = new address[](1);
        list[0] = alice;

        uint256 id = pool.createChallenge(DEPOSIT, DEADLINE, list);
        assertEq(pool.challengeStatus(id), OPEN, "single participant accepted");
    }

    // ── 2b. Commission rate snapshot ─────────────────────────────────────────

    function test_CreateChallengeSnapshotsCommissionRate() public {
        uint256 id = _createOpen();
        assertEq(pool.challengeCommissionRate(id), RATE_5_PCT, "snapshot at creation");
        assertEq(pool.commissionRate(), RATE_5_PCT, "global unchanged");
    }

    /// @notice ANTI-RUG TEST: a challenge resolves at the rate in force when it
    ///         was CREATED. Without the snapshot the owner could raise the
    ///         global rate to 10_000 bps against an already-Locked pool and take
    ///         the whole thing, since `confirmResult` read the live value.
    function test_AntiRug_LockedChallengeUsesRateFromCreationNotLiveRate() public {
        uint256 id = _createLocked();
        uint256 total = DEPOSIT * 3;
        uint256 expectedCommission = (total * RATE_5_PCT) / 10_000;
        uint256 expectedPayout = total - expectedCommission;

        // Owner tries to rug the locked pool by raising the global rate to 100 %.
        pool.setCommissionRate(10_000);
        assertEq(pool.commissionRate(), 10_000, "global raised");
        assertEq(pool.challengeCommissionRate(id), RATE_5_PCT, "snapshot untouched");

        uint256 balanceBefore = usdc.balanceOf(alice);
        vm.prank(operator);
        pool.confirmResult(id, alice);

        assertEq(usdc.balanceOf(alice) - balanceBefore, expectedPayout, "winner paid at creation rate");
        assertEq(usdc.balanceOf(address(pool)), expectedCommission, "commission capped at creation rate");
    }

    function test_ChallengeCreatedAfterRateChangeUsesNewRate() public {
        pool.setCommissionRate(1_000); // 10 %

        uint256 id = _createLocked();
        assertEq(pool.challengeCommissionRate(id), 1_000, "new rate snapshotted");

        uint256 total = DEPOSIT * 3;
        uint256 expectedCommission = (total * 1_000) / 10_000;
        uint256 balanceBefore = usdc.balanceOf(bob);

        vm.prank(operator);
        pool.confirmResult(id, bob);

        assertEq(usdc.balanceOf(bob) - balanceBefore, total - expectedCommission, "payout at new rate");
        assertEq(usdc.balanceOf(address(pool)), expectedCommission, "commission at new rate");
    }

    /// @notice A rate drop is equally frozen: the snapshot is the only input.
    function test_LoweringGlobalRateDoesNotAffectExistingChallenge() public {
        uint256 id = _createLocked();
        pool.setCommissionRate(0);

        uint256 total = DEPOSIT * 3;
        uint256 expectedCommission = (total * RATE_5_PCT) / 10_000;

        vm.prank(operator);
        pool.confirmResult(id, carol);

        assertEq(usdc.balanceOf(address(pool)), expectedCommission, "still the creation rate");
    }

    // ── 3. deposit ───────────────────────────────────────────────────────────

    function test_DepositPullsExactAmountAndLocksOnLastDeposit() public {
        uint256 id = _createOpen();

        vm.prank(alice);
        pool.deposit(id);
        assertEq(pool.challengeStatus(id), OPEN, "still open");
        assertEq(usdc.balanceOf(address(pool)), DEPOSIT, "one deposit pooled");

        vm.prank(bob);
        pool.deposit(id);
        vm.prank(carol);
        pool.deposit(id);

        assertEq(pool.challengeStatus(id), LOCKED, "locked");
        assertEq(usdc.balanceOf(address(pool)), DEPOSIT * 3, "full pool held");
    }

    function test_DepositRevertsForNonParticipant() public {
        uint256 id = _createOpen();
        vm.expectRevert(ChallengePool.NotAParticipant.selector);
        vm.prank(outsider);
        pool.deposit(id);
    }

    function test_DepositRevertsOnSecondDeposit() public {
        uint256 id = _createOpen();
        vm.prank(alice);
        pool.deposit(id);
        vm.expectRevert(ChallengePool.AlreadyDeposited.selector);
        vm.prank(alice);
        pool.deposit(id);
    }

    function test_DepositRevertsWhenChallengeNotOpen() public {
        uint256 id = _createLocked();
        vm.expectRevert(ChallengePool.ChallengeNotOpen.selector);
        vm.prank(alice);
        pool.deposit(id);
    }

    // ── 4. confirmResult — happy path & commission math ──────────────────────

    function test_HappyPathWinnerPaidAndCommissionAccrues() public {
        uint256 id = _createLocked();
        uint256 total = DEPOSIT * 3;
        uint256 expectedCommission = (total * RATE_5_PCT) / 10_000;
        uint256 expectedPayout = total - expectedCommission;
        uint256 balanceBefore = usdc.balanceOf(alice);

        vm.prank(operator);
        pool.confirmResult(id, alice);

        assertEq(pool.challengeStatus(id), RESOLVED, "resolved");
        assertEq(usdc.balanceOf(alice) - balanceBefore, expectedPayout, "winner payout");
        assertEq(usdc.balanceOf(address(pool)), expectedCommission, "commission accrues in pool");
    }

    function test_CommissionAtZeroBpsPaysEverythingToWinner() public {
        pool.setCommissionRate(0);
        uint256 id = _createLocked();
        uint256 total = DEPOSIT * 3;
        uint256 balanceBefore = usdc.balanceOf(bob);

        vm.prank(operator);
        pool.confirmResult(id, bob);

        assertEq(usdc.balanceOf(bob) - balanceBefore, total, "winner gets full pool");
        assertEq(usdc.balanceOf(address(pool)), 0, "nothing accrues");
    }

    function test_CommissionAtFullBpsLeavesWinnerWithZero() public {
        pool.setCommissionRate(10_000);
        uint256 id = _createLocked();
        uint256 total = DEPOSIT * 3;
        uint256 balanceBefore = usdc.balanceOf(carol);

        vm.prank(operator);
        pool.confirmResult(id, carol);

        assertEq(usdc.balanceOf(carol) - balanceBefore, 0, "winner gets nothing");
        assertEq(usdc.balanceOf(address(pool)), total, "commission equals total");
    }

    // ── 5. confirmResult — guards ────────────────────────────────────────────

    /// @notice SECURITY TEST: the operator relays a decision, it does not choose
    ///         the destination of the funds. Without this guard any operator
    ///         could drain a locked pool to an arbitrary wallet.
    function test_Security_ConfirmResultRevertsWhenWinnerIsNotAParticipant() public {
        uint256 id = _createLocked();
        vm.expectRevert(ChallengePool.WinnerNotParticipant.selector);
        vm.prank(operator);
        pool.confirmResult(id, outsider);
    }

    function test_ConfirmResultRevertsForNonOperator() public {
        uint256 id = _createLocked();
        vm.expectRevert(ChallengePool.NotAnOperator.selector);
        vm.prank(outsider);
        pool.confirmResult(id, alice);
    }

    function test_ConfirmResultRevertsForOwnerWhoIsNotOperator() public {
        uint256 id = _createLocked();
        vm.expectRevert(ChallengePool.NotAnOperator.selector);
        pool.confirmResult(id, alice);
    }

    function test_ConfirmResultRevertsWhenNotLocked() public {
        uint256 id = _createOpen();
        vm.expectRevert(ChallengePool.ChallengeNotLocked.selector);
        vm.prank(operator);
        pool.confirmResult(id, alice);
    }

    /// @notice State is validated before membership: an open challenge fails on
    ///         state even when the proposed winner is not a participant.
    function test_ConfirmResultStateCheckPrecedesParticipantCheck() public {
        uint256 id = _createOpen();
        vm.expectRevert(ChallengePool.ChallengeNotLocked.selector);
        vm.prank(operator);
        pool.confirmResult(id, outsider);
    }

    function test_ConfirmResultRevertsOnZeroWinner() public {
        uint256 id = _createLocked();
        vm.expectRevert(ChallengePool.WinnerIsZeroAddress.selector);
        vm.prank(operator);
        pool.confirmResult(id, address(0));
    }

    function test_ConfirmResultRevertsOnSecondResolution() public {
        uint256 id = _createLocked();
        vm.prank(operator);
        pool.confirmResult(id, alice);
        vm.expectRevert(ChallengePool.ChallengeNotLocked.selector);
        vm.prank(operator);
        pool.confirmResult(id, alice);
    }

    // ── 6. refund & claimRefund ──────────────────────────────────────────────

    function test_RefundRevertsBeforeDeadline() public {
        uint256 id = _createLocked();
        vm.expectRevert(ChallengePool.DeadlineNotReached.selector);
        pool.refund(id);
    }

    function test_RefundRevertsWhenNotLocked() public {
        uint256 id = _createOpen();
        vm.warp(DEADLINE + 1);
        vm.expectRevert(ChallengePool.ChallengeNotLocked.selector);
        pool.refund(id);
    }

    function test_RefundAfterDeadlineSplitsEvenlyAndIsPermissionless() public {
        uint256 id = _createLocked();
        vm.warp(DEADLINE + 1);

        vm.prank(outsider);
        pool.refund(id);

        assertEq(pool.challengeStatus(id), REFUNDED, "refunded");
        assertEq(pool.refundPerParticipant(id), DEPOSIT, "even split, no commission");
    }

    function test_ClaimRefundPaysEachParticipantOnce() public {
        uint256 id = _createLocked();
        vm.warp(DEADLINE + 1);
        pool.refund(id);

        address[] memory list = _threeParticipants();
        for (uint256 i = 0; i < list.length; i++) {
            uint256 before = usdc.balanceOf(list[i]);
            vm.prank(list[i]);
            pool.claimRefund(id);
            assertEq(usdc.balanceOf(list[i]) - before, DEPOSIT, "refund amount");
        }
        assertEq(usdc.balanceOf(address(pool)), 0, "pool drained");
    }

    function test_ClaimRefundRevertsOnSecondClaim() public {
        uint256 id = _createLocked();
        vm.warp(DEADLINE + 1);
        pool.refund(id);

        vm.prank(alice);
        pool.claimRefund(id);
        vm.expectRevert(ChallengePool.AlreadyClaimed.selector);
        vm.prank(alice);
        pool.claimRefund(id);
    }

    function test_ClaimRefundRevertsForNonParticipant() public {
        uint256 id = _createLocked();
        vm.warp(DEADLINE + 1);
        pool.refund(id);

        vm.expectRevert(ChallengePool.NotAParticipant.selector);
        vm.prank(outsider);
        pool.claimRefund(id);
    }

    function test_ClaimRefundRevertsWhenNotRefunded() public {
        uint256 id = _createLocked();
        vm.expectRevert(ChallengePool.NotRefunded.selector);
        vm.prank(alice);
        pool.claimRefund(id);
    }

    function test_RefundRevertsAfterResolution() public {
        uint256 id = _createLocked();
        vm.prank(operator);
        pool.confirmResult(id, alice);
        vm.warp(DEADLINE + 1);
        vm.expectRevert(ChallengePool.ChallengeNotLocked.selector);
        pool.refund(id);
    }

    // ── 7. Non-standard ERC-20 return shapes ─────────────────────────────────

    function test_WorksWithUsdcThatReturnsNoData() public {
        MockUSDCNoReturn token = new MockUSDCNoReturn();
        ChallengePool quietPool = new ChallengePool(address(token), RATE_5_PCT);
        quietPool.addOperator(operator);

        address[] memory list = _threeParticipants();
        for (uint256 i = 0; i < list.length; i++) {
            token.mint(list[i], DEPOSIT);
            vm.prank(list[i]);
            token.approve(address(quietPool), type(uint256).max);
        }

        uint256 id = quietPool.createChallenge(DEPOSIT, DEADLINE, list);
        for (uint256 i = 0; i < list.length; i++) {
            vm.prank(list[i]);
            quietPool.deposit(id);
        }
        assertEq(quietPool.challengeStatus(id), LOCKED, "locked with no-return token");

        vm.prank(operator);
        quietPool.confirmResult(id, alice);
        assertEq(quietPool.challengeStatus(id), RESOLVED, "resolved with no-return token");
    }

    function test_RevertsWhenUsdcReturnsFalse() public {
        MockUSDCFalseReturn token = new MockUSDCFalseReturn();
        ChallengePool badPool = new ChallengePool(address(token), RATE_5_PCT);

        address[] memory list = _threeParticipants();
        uint256 id = badPool.createChallenge(DEPOSIT, DEADLINE, list);

        vm.expectRevert(ChallengePool.TransferFailed.selector);
        vm.prank(alice);
        badPool.deposit(id);
    }
}
