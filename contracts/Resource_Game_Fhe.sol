pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";


contract ResourceGameFhe is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    address public owner;
    mapping(address => bool) public providers;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;
    uint256 public cooldownSeconds = 60;
    bool public paused;

    uint256 public currentBatchId;
    bool public batchOpen;

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    struct AllocationVote {
        euint32 projectId;
        euint32 allocatedAmount;
        ebool isSabotage; // True if this vote is intended to be disruptive
    }
    mapping(uint256 => mapping(address => AllocationVote)) public encryptedVotes;

    struct Project {
        euint32 totalAllocated;
        euint32 sabotageCount; // Count of votes marked as sabotage for this project
    }
    mapping(uint256 => mapping(euint32 => Project)) public encryptedProjectData;


    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event CooldownSet(uint256 oldCooldown, uint256 newCooldown);
    event Paused(address account);
    event Unpaused(address account);
    event BatchOpened(uint256 batchId);
    event BatchClosed(uint256 batchId);
    event VoteSubmitted(address indexed voter, uint256 batchId, euint32 projectId);
    event DecryptionRequested(uint256 requestId, uint256 batchId, bytes32 stateHash);
    event DecryptionCompleted(uint256 requestId, uint256 batchId, uint256[] projectIds, uint256[] totalAllocated, uint256[] sabotageCounts);

    error NotOwner();
    error NotProvider();
    error PausedError();
    error CooldownActive();
    error BatchNotOpen();
    error BatchOpenError();
    error ReplayError();
    error StateMismatchError();
    error InvalidProjectId();
    error InvalidAmount();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!providers[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert PausedError();
        _;
    }

    modifier checkSubmissionCooldown(address _address) {
        if (block.timestamp < lastSubmissionTime[_address] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    modifier checkDecryptionCooldown(address _address) {
        if (block.timestamp < lastDecryptionRequestTime[_address] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function addProvider(address provider) external onlyOwner {
        providers[provider] = true;
        emit ProviderAdded(provider);
    }

    function removeProvider(address provider) external onlyOwner {
        providers[provider] = false;
        emit ProviderRemoved(provider);
    }

    function setCooldownSeconds(uint256 newCooldown) external onlyOwner {
        require(newCooldown > 0, "Cooldown must be positive");
        emit CooldownSet(cooldownSeconds, newCooldown);
        cooldownSeconds = newCooldown;
    }

    function pause() external onlyOwner whenNotPaused {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function openBatch() external onlyOwner whenNotPaused {
        if (batchOpen) revert BatchOpenError();
        currentBatchId++;
        batchOpen = true;
        emit BatchOpened(currentBatchId);
    }

    function closeBatch() external onlyOwner whenNotPaused {
        if (!batchOpen) revert BatchNotOpen();
        batchOpen = false;
        emit BatchClosed(currentBatchId);
    }

    function submitVote(
        euint32 _projectId,
        euint32 _allocatedAmount,
        ebool _isSabotage
    ) external onlyProvider whenNotPaused checkSubmissionCooldown(msg.sender) {
        if (!batchOpen) revert BatchNotOpen();
        if (!_projectId.isInitialized()) revert InvalidProjectId();
        if (!_allocatedAmount.isInitialized()) revert InvalidAmount();

        encryptedVotes[currentBatchId][msg.sender] = AllocationVote({
            projectId: _projectId,
            allocatedAmount: _allocatedAmount,
            isSabotage: _isSabotage
        });
        lastSubmissionTime[msg.sender] = block.timestamp;
        emit VoteSubmitted(msg.sender, currentBatchId, _projectId);
    }

    function requestBatchDecryption() external onlyOwner whenNotPaused checkDecryptionCooldown(msg.sender) {
        if (batchOpen) revert BatchOpenError(); // Must be closed to process

        uint256 requestId = FHE.requestDecryption(_prepareCiphertexts(currentBatchId), this.myCallback.selector);
        bytes32 stateHash = _hashCiphertexts(_prepareCiphertexts(currentBatchId));
        decryptionContexts[requestId] = DecryptionContext({ batchId: currentBatchId, stateHash: stateHash, processed: false });
        lastDecryptionRequestTime[msg.sender] = block.timestamp;
        emit DecryptionRequested(requestId, currentBatchId, stateHash);
    }

    function myCallback(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        // @dev Replay protection: ensure this callback hasn't been processed for this requestId
        if (decryptionContexts[requestId].processed) revert ReplayError();

        // @dev State verification: ensure the contract state (ciphertexts) hasn't changed since the decryption was requested
        // Rebuild the ciphertexts array in the exact same order as during requestDecryption
        bytes32 currentHash = _hashCiphertexts(_prepareCiphertexts(decryptionContexts[requestId].batchId));
        if (currentHash != decryptionContexts[requestId].stateHash) {
            revert StateMismatchError();
        }

        // @dev Proof verification: ensure the decryption proof is valid
        FHE.checkSignatures(requestId, cleartexts, proof);

        // Decode cleartexts and process results
        (uint256[] memory projectIds, uint256[] memory totalAllocated, uint256[] memory sabotageCounts) = abi.decode(cleartexts, (uint256[], uint256[], uint256[]));
        
        // Example: Emit results. In a real game, this might update a leaderboard or trigger game logic.
        // For this contract, we just emit the results.
        emit DecryptionCompleted(requestId, decryptionContexts[requestId].batchId, projectIds, totalAllocated, sabotageCounts);
        
        decryptionContexts[requestId].processed = true;
    }

    function _prepareCiphertexts(uint256 batchId) internal view returns (bytes32[] memory cts) {
        // This function prepares the ciphertexts for decryption.
        // It iterates through all providers who voted in the batch and collects their encrypted votes.
        // Then, it iterates through all projects that received votes and collects their encrypted totals.
        // This is a simplified example; a real implementation might need more sophisticated iteration or data structures.

        // First, determine how many providers voted and how many unique projects exist
        // This part is simplified for this example. A real contract would need a way to track these.
        // For now, we'll assume we iterate through all *possible* providers and projects,
        // which is inefficient but demonstrates the FHE pattern.
        // A better approach would be to maintain lists of active providers/projects per batch.
        // For this example, we'll just use a fixed number of providers and projects.
        // Let's assume we have 3 providers and 2 projects for demonstration.
        // In a real scenario, these would be dynamic.
        
        // This is a placeholder for a more robust way to get providers who voted
        address[] memory activeProviders = new address[](3); // Example: 3 providers
        if (providers[address(0x10000)]) activeProviders[0] = address(0x10000);
        if (providers[address(0x20000)]) activeProviders[1] = address(0x20000);
        if (providers[address(0x30000)]) activeProviders[2] = address(0x30000);


        // This is a placeholder for a more robust way to get projects that received votes
        // We'll assume project IDs 1 and 2 for this example
        euint32[] memory activeProjects = new euint32[](2);
        activeProjects[0] = FHE.asEuint32(1);
        activeProjects[1] = FHE.asEuint32(2);


        // Calculate total number of ciphertexts:
        // For each provider: projectId (1), allocatedAmount (1), isSabotage (1) = 3
        // For each project: totalAllocated (1), sabotageCount (1) = 2
        uint256 numProviderCts = activeProviders.length * 3;
        uint256 numProjectCts = activeProjects.length * 2;
        cts = new bytes32[](numProviderCts + numProjectCts);

        uint256 idx = 0;
        for (uint i = 0; i < activeProviders.length; i++) {
            if (activeProviders[i] == address(0)) continue; // Skip empty slots
            AllocationVote storage vote = encryptedVotes[batchId][activeProviders[i]];
            if (!_initIfNeeded(address(0), vote.projectId)) continue; // Skip if vote not initialized
            cts[idx++] = FHE.toBytes32(vote.projectId);
            cts[idx++] = FHE.toBytes32(vote.allocatedAmount);
            cts[idx++] = FHE.toBytes32(vote.isSabotage);
        }

        for (uint i = 0; i < activeProjects.length; i++) {
            Project storage project = encryptedProjectData[batchId][activeProjects[i]];
            if (!_initIfNeeded(address(0), project.totalAllocated)) continue; // Skip if project not initialized
            cts[idx++] = FHE.toBytes32(project.totalAllocated);
            cts[idx++] = FHE.toBytes32(project.sabotageCount);
        }
        // Note: The actual aggregation logic (summing votes, counting sabotage) is not shown here.
        // This contract focuses on the FHE decryption pattern. The encryptedProjectData would be
        // populated by other functions (not implemented in this example) that use FHE.add, etc.
    }

    function _hashCiphertexts(bytes32[] memory cts) internal view returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(address, euint32 v) internal pure returns (bool) {
        return v.isInitialized();
    }

    // Example function to show how encrypted data might be aggregated (not fully implemented)
    // This would typically be called after votes are submitted but before requesting decryption.
    // For this example, we'll just show a skeleton.
    function aggregateVotes(uint256 batchId) external onlyOwner whenNotPaused {
        // This function would iterate through votes and use FHE.add, FHE.eq, etc.
        // to populate encryptedProjectData.
        // Example (conceptual):
        // for each provider who voted:
        //   projectId = encryptedVotes[batchId][provider].projectId
        //   amount = encryptedVotes[batchId][provider].allocatedAmount
        //   isSabotage = encryptedVotes[batchId][provider].isSabotage
        //   encryptedProjectData[batchId][projectId].totalAllocated = FHE.add(encryptedProjectData[batchId][projectId].totalAllocated, amount);
        //   encryptedProjectData[batchId][projectId].sabotageCount = FHE.add(encryptedProjectData[batchId][projectId].sabotageCount, FHE.select(isSabotage, FHE.asEuint32(1), FHE.asEuint32(0)));
        // This is not implemented here to keep the focus on the decryption pattern.
    }
}