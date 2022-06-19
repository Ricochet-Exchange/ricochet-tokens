// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;
pragma abicoder v2;

interface IMasterChef {
    struct UserInfo {
        uint256 amount;
        uint256 rewardDebt;
    }

    struct PoolInfo {
        uint128 accSushiPerShare;
        uint64 lastRewardTime;
        uint64 allocPoint;
    }

    function poolLength() external view returns (uint256);
    function updatePool(uint256 pid) external returns (IMasterChef.PoolInfo memory);
    function userInfo(uint256 _pid, address _user) external view returns (uint256, uint256);
    function deposit(uint256 pid, uint256 amount) external;
    function withdraw(uint256 pid, uint256 amount) external;
    function harvest(uint256 pid, address to) external;
    function withdrawAndHarvest(uint256 pid, uint256 amount, address to) external;
    function emergencyWithdraw(uint256 pid, address to) external;
    function pendingSdt(uint256 _pid, address _user) external view returns (uint256 pending);
}
