# Resource Game: A Social Deduction Game Powered by Zama's FHE Technology

Resource Game is an innovative multiplayer social deduction game that utilizes **Zama's Fully Homomorphic Encryption (FHE) technology** to ensure anonymity in community resource allocation. Players must engage in strategic voting to distribute public resources while identifying "destroyers" among them, who aim to mislead the community and disrupt efficient allocation.

## The Challenge of Resource Allocation

In traditional community setups, resource allocation can be plagued by mistrust and lack of transparency, leading to inefficiencies and conflicts. Players often confront the dilemma of anonymity versus accountability, making it challenging to govern shared resources effectively. How can communities allocate resources fairly while ensuring that every vote is counted without revealing the identity of the voters?

## The FHE Solution

Zama's Fully Homomorphic Encryption is at the core of the Resource Game, providing a robust solution to the challenges of secure voting and resource allocation. By implementing Zama’s open-source libraries, like **Concrete** and **TFHE-rs**, we allow players to cast their votes anonymously while ensuring that their decisions contribute to a transparent allocation process. The privacy-preserving features of FHE enable players to engage without fear of manipulation or intimidation, thus fostering a collaborative environment.

## Core Features

- **FHE-Encrypted Voting**: Players vote anonymously on how to allocate community resources while ensuring their choices remain confidential.
- **Secret Identity of Destroyers**: The identities of "destroyers", those who aim to hinder resource allocation, are kept secret, creating an intriguing layer of strategy and social deduction.
- **DAO Governance Integration**: Combines decentralized autonomous organization (DAO) governance with engaging social deduction gameplay, allowing for fun yet informative community decision-making.
- **Educational Gameplay**: Provides players with insights into the "tragedy of the commons" and effective community governance in an entertaining format.

## Technology Stack

- **Zama SDK (Concrete and TFHE-rs)**: The primary tool for implementing FHE to ensure secure voting.
- **Node.js**: For building and running the project's backend.
- **Hardhat/Foundry**: Development environments for Ethereum smart contracts.
- **React**: Frontend framework for building an interactive user interface.

## Project Structure

Here is the directory structure of the Resource Game:

```
Resource_Game_FHE/
├── contracts/
│   └── Resource_Game_FHE.sol
├── src/
│   ├── index.js
│   └── components/
│       ├── Voting.js
│       └── Dashboard.js
├── tests/
│   └── Voting.test.js
├── package.json
└── README.md
```

## Installation Guide

To get started, make sure you have the following prerequisites installed on your machine:

- **Node.js**: Ensure you have the latest version installed. 
- **Hardhat or Foundry**: Set up according to the respective documentation.

After you have downloaded the project files (do not use `git clone`), navigate to the project directory in your terminal and run:

```bash
npm install
```

This command will install all necessary dependencies, including Zama's FHE libraries.

## Build & Run

Once everything is set up, you can compile and run the project with the following commands:

1. **Compile the Smart Contracts**:

```bash
npx hardhat compile
```

2. **Run Tests**:

```bash
npx hardhat test
```

3. **Start the Development Server**:

```bash
npm start
```

This will launch the Resource Game in your browser, allowing you to experience the engaging world of resource allocation and deduction firsthand.

### Example Code Snippet

Here’s an example of how a voting function might look in your smart contract:

```solidity
pragma solidity ^0.8.0;

contract Resource_Game_FHE {
    struct Vote {
        address voter;
        uint256 choice; // 0 for allocate, 1 for delay
        bool isVoted;
    }

    mapping(address => Vote) public votes;

    function castVote(uint256 _choice) public {
        require(!votes[msg.sender].isVoted, "You have already voted.");
        votes[msg.sender] = Vote(msg.sender, _choice, true);
    }
    
    function tallyVotes() public view returns (uint256 allocateVotes, uint256 delayVotes) {
        // Logic for tallying votes
    }
}
```

This snippet provides a basic structure for voting, demonstrating how players can submit their choices securely.

## Acknowledgements

### Powered by Zama

We extend our heartfelt thanks to the Zama team for their groundbreaking work and open-source tools that empower us to create secure and confidential blockchain applications. Their commitment to FHE technology has made our vision for Resource Game a reality, ensuring a fun and educational experience for players while preserving the integrity of community governance.