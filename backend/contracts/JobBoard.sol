// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

contract JobBoard {
    enum JobStatus { OPEN, ASSIGNED, COMPLETED, REFUNDED }
    
    struct Job {
        string title;
        string description;
        uint256 budget;
        address employer;
        address freelancer;
        JobStatus status;
        uint256 escrowTime; // Tracks when funds were locked
    }
    
    uint256 public jobCount;
    mapping(uint256 => Job) public jobs;
    mapping(uint256 => uint256) public escrowedFunds;
    
    uint256 public constant REFUND_DELAY = 7 days; // Time before refund allowed
    
    event JobPosted(uint256 indexed jobId, address indexed employer, string title, uint256 budget);
    event JobApplied(uint256 indexed jobId, address indexed freelancer);
    event PaymentEscrowed(uint256 indexed jobId, uint256 amount);
    event PaymentReleased(uint256 indexed jobId, address indexed freelancer, uint256 amount);
    event EmployerRefunded(uint256 indexed jobId, address indexed employer, uint256 amount);
    
    modifier onlyEmployer(uint256 jobId) {
        require(msg.sender == jobs[jobId].employer, "Only employer can call this");
        _;
    }
    
    modifier jobExists(uint256 jobId) {
        require(jobId <= jobCount && jobId != 0, "Job does not exist");
        _;
    }

    function postJob(
        string memory _title,
        string memory _description,
        uint256 _budget
    ) public {
        require(_budget > 0, "Budget must be greater than 0");
        jobCount++;
        
        jobs[jobCount] = Job({
            title: _title,
            description: _description,
            budget: _budget,
            employer: msg.sender,
            freelancer: address(0),
            status: JobStatus.OPEN,
            escrowTime: 0 // Initialize to 0 (not escrowed yet)
        });
        
        emit JobPosted(jobCount, msg.sender, _title, _budget);
    }

    function applyForJob(uint256 jobId) public jobExists(jobId) {
    Job storage job = jobs[jobId];
    
    // CORRECT ORDER - check assignment first!
    require(job.freelancer == address(0), "Job already assigned");
    require(job.status == JobStatus.OPEN, "Job is not open");
    require(escrowedFunds[jobId] == job.budget, "Employer must escrow funds first");
    
    job.freelancer = msg.sender;
    job.status = JobStatus.ASSIGNED;
    
    emit JobApplied(jobId, msg.sender);
}

    function escrowFunds(uint256 jobId) public payable jobExists(jobId) onlyEmployer(jobId) { // The onlyEmployer(jobId) modifier is attached.
    Job storage job = jobs[jobId];
    
    require(job.status == JobStatus.OPEN, "Job must be open");
    require(msg.value == job.budget, "Must send exact budget amount");
    require(escrowedFunds[jobId] == 0, "Funds already escrowed");
    
    escrowedFunds[jobId] = msg.value; //  Funds Locking: Stores msg.value in escrowedFunds[jobId].
    job.escrowTime = block.timestamp;
    
    emit PaymentEscrowed(jobId, msg.value);
   } 

    function releasePayment(uint256 jobId) public jobExists(jobId) onlyEmployer(jobId) {
        Job storage job = jobs[jobId];
        
        require(job.status == JobStatus.ASSIGNED, "Job must be assigned");
        require(escrowedFunds[jobId] == job.budget, "Incorrect escrow amount");
        
        job.status = JobStatus.COMPLETED;
        uint256 amount = escrowedFunds[jobId];
        escrowedFunds[jobId] = 0;
        
        payable(job.freelancer).transfer(amount);
        
        emit PaymentReleased(jobId, job.freelancer, amount);
    }

    function refundEmployer(uint256 jobId) public jobExists(jobId) onlyEmployer(jobId) {
        Job storage job = jobs[jobId];
        
        require(job.status == JobStatus.OPEN, "Job must be open");
        require(block.timestamp >= job.escrowTime + REFUND_DELAY, "Refund delay not passed");
        require(escrowedFunds[jobId] > 0, "No funds to refund");
        
        job.status = JobStatus.REFUNDED;
        uint256 amount = escrowedFunds[jobId];
        escrowedFunds[jobId] = 0;
        
        payable(job.employer).transfer(amount);
        
        emit EmployerRefunded(jobId, job.employer, amount);
    }

    function getJobCount() public view returns (uint256) {
        return jobCount;
    }
}