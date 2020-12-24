pragma solidity 0.5.11;



contract ISeedSwap {
    function swapEthToToken() external payable returns (uint256 tokenAmount);
    function distributeAll(uint256 percentage, uint256 daysBefore) external returns (uint256 totalAmount);
    function distributeBatch(uint256 percentage, uint256[] calldata ids) external returns (uint256 totalAmount);
    function emergencyUserWithdrawToken() external returns (uint256 tokenAmount);
    function getUserSwapData(address user)
        external view
        returns (
            uint256 totalEthAmount,
            uint128 totalTokenAmount,
            uint128 distributedAmount,
            uint128 remainingAmount,
            uint128[] memory ethAmounts,
            uint128[] memory tokenAmounts,
            uint128[] memory distributedAmounts,
            uint128[] memory timestamps
        );
}
