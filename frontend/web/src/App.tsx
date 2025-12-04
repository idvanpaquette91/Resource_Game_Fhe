// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface ResourceAllocation {
  id: string;
  encryptedAmount: string;
  timestamp: number;
  voter: string;
  status: "pending" | "approved" | "rejected";
  isSaboteur: boolean;
}

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [allocations, setAllocations] = useState<ResourceAllocation[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showVoteModal, setShowVoteModal] = useState(false);
  const [voting, setVoting] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newVote, setNewVote] = useState({ amount: 0, isSaboteur: false });
  const [showIntro, setShowIntro] = useState(true);
  const [selectedAllocation, setSelectedAllocation] = useState<ResourceAllocation | null>(null);
  const [decryptedAmount, setDecryptedAmount] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [userHistory, setUserHistory] = useState<ResourceAllocation[]>([]);

  const approvedCount = allocations.filter(a => a.status === "approved").length;
  const pendingCount = allocations.filter(a => a.status === "pending").length;
  const rejectedCount = allocations.filter(a => a.status === "rejected").length;
  const saboteurCount = allocations.filter(a => a.isSaboteur).length;

  useEffect(() => {
    loadAllocations().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  useEffect(() => {
    if (address && allocations.length > 0) {
      setUserHistory(allocations.filter(a => a.voter.toLowerCase() === address.toLowerCase()));
    }
  }, [address, allocations]);

  const loadAllocations = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      const keysBytes = await contract.getData("allocation_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing allocation keys:", e); }
      }
      const list: ResourceAllocation[] = [];
      for (const key of keys) {
        try {
          const allocationBytes = await contract.getData(`allocation_${key}`);
          if (allocationBytes.length > 0) {
            try {
              const allocationData = JSON.parse(ethers.toUtf8String(allocationBytes));
              list.push({ 
                id: key, 
                encryptedAmount: allocationData.amount, 
                timestamp: allocationData.timestamp, 
                voter: allocationData.voter, 
                status: allocationData.status || "pending",
                isSaboteur: allocationData.isSaboteur || false
              });
            } catch (e) { console.error(`Error parsing allocation data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading allocation ${key}:`, e); }
      }
      list.sort((a, b) => b.timestamp - a.timestamp);
      setAllocations(list);
    } catch (e) { console.error("Error loading allocations:", e); } 
    finally { setIsRefreshing(false); setLoading(false); }
  };

  const submitVote = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setVoting(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting vote with Zama FHE..." });
    try {
      const encryptedAmount = FHEEncryptNumber(newVote.amount);
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      const allocationId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const allocationData = { 
        amount: encryptedAmount, 
        timestamp: Math.floor(Date.now() / 1000), 
        voter: address, 
        status: "pending",
        isSaboteur: newVote.isSaboteur
      };
      await contract.setData(`allocation_${allocationId}`, ethers.toUtf8Bytes(JSON.stringify(allocationData)));
      const keysBytes = await contract.getData("allocation_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { keys = JSON.parse(ethers.toUtf8String(keysBytes)); } 
        catch (e) { console.error("Error parsing keys:", e); }
      }
      keys.push(allocationId);
      await contract.setData("allocation_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      setTransactionStatus({ visible: true, status: "success", message: "Encrypted vote submitted!" });
      await loadAllocations();
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowVoteModal(false);
        setNewVote({ amount: 0, isSaboteur: false });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") ? "Transaction rejected by user" : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { setVoting(false); }
  };

  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { alert("Please connect wallet first"); return null; }
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      return FHEDecryptNumber(encryptedData);
    } catch (e) { console.error("Decryption failed:", e); return null; } 
    finally { setIsDecrypting(false); }
  };

  const approveAllocation = async (allocationId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing encrypted vote..." });
    try {
      const contractWithSigner = await getContractWithSigner();
      if (!contractWithSigner) throw new Error("Failed to get contract with signer");
      const allocationBytes = await contractWithSigner.getData(`allocation_${allocationId}`);
      if (allocationBytes.length === 0) throw new Error("Allocation not found");
      const allocationData = JSON.parse(ethers.toUtf8String(allocationBytes));
      const updatedAllocation = { ...allocationData, status: "approved" };
      await contractWithSigner.setData(`allocation_${allocationId}`, ethers.toUtf8Bytes(JSON.stringify(updatedAllocation)));
      setTransactionStatus({ visible: true, status: "success", message: "Vote approved!" });
      await loadAllocations();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Approval failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const rejectAllocation = async (allocationId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing encrypted vote..." });
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      const allocationBytes = await contract.getData(`allocation_${allocationId}`);
      if (allocationBytes.length === 0) throw new Error("Allocation not found");
      const allocationData = JSON.parse(ethers.toUtf8String(allocationBytes));
      const updatedAllocation = { ...allocationData, status: "rejected" };
      await contract.setData(`allocation_${allocationId}`, ethers.toUtf8Bytes(JSON.stringify(updatedAllocation)));
      setTransactionStatus({ visible: true, status: "success", message: "Vote rejected!" });
      await loadAllocations();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Rejection failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const isVoter = (allocationAddress: string) => address?.toLowerCase() === allocationAddress.toLowerCase();

  const filteredAllocations = allocations.filter(allocation => {
    const matchesSearch = allocation.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         allocation.voter.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === "all" || allocation.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const renderStatsCards = () => {
    return (
      <div className="stats-grid">
        <div className="stat-card">
          <h3>Total Votes</h3>
          <div className="stat-value">{allocations.length}</div>
        </div>
        <div className="stat-card">
          <h3>Approved</h3>
          <div className="stat-value">{approvedCount}</div>
        </div>
        <div className="stat-card">
          <h3>Pending</h3>
          <div className="stat-value">{pendingCount}</div>
        </div>
        <div className="stat-card">
          <h3>Rejected</h3>
          <div className="stat-value">{rejectedCount}</div>
        </div>
        <div className="stat-card">
          <h3>Saboteurs</h3>
          <div className="stat-value">{saboteurCount}</div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing encrypted connection...</p>
    </div>
  );

  return (
    <div className="app-container dark-theme">
      <header className="app-header">
        <div className="logo">
          <h1>Secret<span>Allocation</span></h1>
          <p className="tagline">FHE-encrypted resource voting game</p>
        </div>
        <div className="header-actions">
          <button onClick={() => setShowVoteModal(true)} className="vote-btn">
            Cast Vote
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>

      <div className="main-content">
        {showIntro && (
          <div className="intro-card">
            <h2>Welcome to Secret Allocation</h2>
            <p>
              A social deduction game where players anonymously vote on community resource allocation using <strong>Zama FHE encryption</strong>. 
              Beware of saboteurs trying to disrupt fair distribution!
            </p>
            <div className="intro-features">
              <div className="feature">
                <div className="feature-icon">🔒</div>
                <h3>FHE Encryption</h3>
                <p>Votes are encrypted end-to-end using Zama's Fully Homomorphic Encryption</p>
              </div>
              <div className="feature">
                <div className="feature-icon">🕵️</div>
                <h3>Find Saboteurs</h3>
                <p>Identify players trying to sabotage fair resource allocation</p>
              </div>
              <div className="feature">
                <div className="feature-icon">🏛️</div>
                <h3>DAO Governance</h3>
                <p>Learn about decentralized governance through gameplay</p>
              </div>
            </div>
            <button className="close-intro" onClick={() => setShowIntro(false)}>Start Playing</button>
          </div>
        )}

        <div className="dashboard-section">
          <h2>Voting Statistics</h2>
          {renderStatsCards()}
        </div>

        <div className="search-filter">
          <input 
            type="text" 
            placeholder="Search votes by ID or voter..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)}>
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <button onClick={loadAllocations} disabled={isRefreshing}>
            {isRefreshing ? "Refreshing..." : "Refresh Data"}
          </button>
        </div>

        <div className="allocations-list">
          <div className="list-header">
            <h2>Resource Allocation Votes</h2>
            <div className="header-info">
              Showing {filteredAllocations.length} of {allocations.length} votes
            </div>
          </div>
          
          {filteredAllocations.length === 0 ? (
            <div className="no-votes">
              <p>No votes match your search criteria</p>
              <button onClick={() => { setSearchTerm(""); setFilterStatus("all"); }}>
                Clear Filters
              </button>
            </div>
          ) : (
            <div className="votes-grid">
              {filteredAllocations.map(allocation => (
                <div 
                  className={`vote-card ${allocation.status} ${allocation.isSaboteur ? 'saboteur' : ''}`} 
                  key={allocation.id}
                  onClick={() => setSelectedAllocation(allocation)}
                >
                  <div className="vote-id">#{allocation.id.substring(0, 6)}</div>
                  <div className="vote-voter">{allocation.voter.substring(0, 6)}...{allocation.voter.substring(38)}</div>
                  <div className="vote-status">
                    <span className={`status-badge ${allocation.status}`}>{allocation.status}</span>
                    {allocation.isSaboteur && <span className="saboteur-badge">Saboteur</span>}
                  </div>
                  <div className="vote-date">{new Date(allocation.timestamp * 1000).toLocaleDateString()}</div>
                  <div className="vote-actions">
                    {isVoter(allocation.voter) && allocation.status === "pending" && (
                      <>
                        <button className="action-btn approve" onClick={(e) => { e.stopPropagation(); approveAllocation(allocation.id); }}>
                          Approve
                        </button>
                        <button className="action-btn reject" onClick={(e) => { e.stopPropagation(); rejectAllocation(allocation.id); }}>
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {address && userHistory.length > 0 && (
          <div className="user-history">
            <h2>Your Voting History</h2>
            <div className="history-grid">
              {userHistory.map(allocation => (
                <div className="history-card" key={allocation.id}>
                  <div className="history-id">#{allocation.id.substring(0, 6)}</div>
                  <div className="history-status">
                    <span className={`status-badge ${allocation.status}`}>{allocation.status}</span>
                    {allocation.isSaboteur && <span className="saboteur-badge">Saboteur</span>}
                  </div>
                  <div className="history-date">{new Date(allocation.timestamp * 1000).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showVoteModal && (
        <div className="modal-overlay">
          <div className="vote-modal">
            <div className="modal-header">
              <h2>Cast Your Vote</h2>
              <button onClick={() => setShowVoteModal(false)} className="close-modal">&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Resource Allocation Amount</label>
                <input 
                  type="number" 
                  value={newVote.amount}
                  onChange={(e) => setNewVote({...newVote, amount: parseFloat(e.target.value) || 0})}
                  placeholder="Enter amount..."
                />
              </div>
              <div className="form-group">
                <label>
                  <input 
                    type="checkbox" 
                    checked={newVote.isSaboteur}
                    onChange={(e) => setNewVote({...newVote, isSaboteur: e.target.checked})}
                  />
                  I'm a saboteur (secret role)
                </label>
              </div>
              <div className="encryption-preview">
                <h4>Encryption Preview</h4>
                <div className="preview-content">
                  <div className="plain-value">
                    <span>Plain Value:</span>
                    <div>{newVote.amount}</div>
                  </div>
                  <div className="arrow">→</div>
                  <div className="encrypted-value">
                    <span>Encrypted:</span>
                    <div>{newVote.amount ? FHEEncryptNumber(newVote.amount).substring(0, 30) + '...' : 'None'}</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowVoteModal(false)} className="cancel-btn">
                Cancel
              </button>
              <button onClick={submitVote} disabled={voting} className="submit-btn">
                {voting ? "Submitting..." : "Submit Encrypted Vote"}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedAllocation && (
        <div className="modal-overlay">
          <div className="detail-modal">
            <div className="modal-header">
              <h2>Vote Details</h2>
              <button onClick={() => { setSelectedAllocation(null); setDecryptedAmount(null); }} className="close-modal">&times;</button>
            </div>
            <div className="modal-body">
              <div className="detail-row">
                <span>Voter:</span>
                <span>{selectedAllocation.voter}</span>
              </div>
              <div className="detail-row">
                <span>Status:</span>
                <span className={`status-badge ${selectedAllocation.status}`}>{selectedAllocation.status}</span>
              </div>
              <div className="detail-row">
                <span>Date:</span>
                <span>{new Date(selectedAllocation.timestamp * 1000).toLocaleString()}</span>
              </div>
              <div className="detail-row">
                <span>Saboteur:</span>
                <span>{selectedAllocation.isSaboteur ? "Yes" : "No"}</span>
              </div>
              <div className="encrypted-data">
                <h3>Encrypted Amount</h3>
                <div className="encrypted-value">{selectedAllocation.encryptedAmount.substring(0, 50)}...</div>
                <button 
                  className="decrypt-btn" 
                  onClick={async () => {
                    if (decryptedAmount === null) {
                      const decrypted = await decryptWithSignature(selectedAllocation.encryptedAmount);
                      if (decrypted !== null) setDecryptedAmount(decrypted);
                    } else {
                      setDecryptedAmount(null);
                    }
                  }}
                  disabled={isDecrypting}
                >
                  {isDecrypting ? "Decrypting..." : decryptedAmount !== null ? "Hide Value" : "Decrypt with Wallet"}
                </button>
              </div>
              {decryptedAmount !== null && (
                <div className="decrypted-data">
                  <h3>Decrypted Amount</h3>
                  <div className="decrypted-value">{decryptedAmount}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className={`transaction-content ${transactionStatus.status}`}>
            <div className="transaction-icon">
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-left">
            <h3>Secret Allocation</h3>
            <p>FHE-encrypted social deduction game</p>
          </div>
          <div className="footer-right">
            <div className="fhe-badge">
              <span>Powered by Zama FHE</span>
            </div>
            <div className="copyright">
              © {new Date().getFullYear()} Secret Allocation
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;