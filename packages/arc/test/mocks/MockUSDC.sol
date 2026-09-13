// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  MockUSDCBase
/// @notice Shared 6-decimal ERC-20 storage and bookkeeping for the mocks below.
abstract contract MockUSDCBase {
    string public constant name = "Mock USD Coin";
    string public constant symbol = "USDC";
    uint8 public constant decimals = 6;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "balance");
        unchecked {
            balanceOf[from] -= amount;
        }
        balanceOf[to] += amount;
    }

    function _spendAllowance(address from, uint256 amount) internal {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance");
        if (allowed != type(uint256).max) {
            unchecked {
                allowance[from][msg.sender] = allowed - amount;
            }
        }
    }
}

/// @notice Standard mock: `transfer` / `transferFrom` return a boolean.
contract MockUSDC is MockUSDCBase {
    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        _spendAllowance(from, amount);
        _transfer(from, to, amount);
        return true;
    }
}

/// @notice USDC-style mock whose transfer functions return no data at all,
///         which is what several real USDC deployments do. The pool's
///         `_safeTransfer` helpers must accept this shape too.
contract MockUSDCNoReturn is MockUSDCBase {
    function transfer(address to, uint256 amount) external {
        _transfer(msg.sender, to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) external {
        _spendAllowance(from, amount);
        _transfer(from, to, amount);
    }
}

/// @notice Mock that explicitly returns `false` from transfers.
contract MockUSDCFalseReturn is MockUSDCBase {
    function transfer(address, uint256) external pure returns (bool) {
        return false;
    }

    function transferFrom(address, address, uint256) external pure returns (bool) {
        return false;
    }
}
