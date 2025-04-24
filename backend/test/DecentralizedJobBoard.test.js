const { expect } = require('chai');
const { BN, expectEvent, expectRevert, time } = require('@openzeppelin/test-helpers');
const JobBoard = artifacts.require('JobBoard');

contract('JobBoard', (accounts) => {
  const [employer, freelancer, otherAccount] = accounts;
  const REFUND_DELAY = 7 * 24 * 3600;
  const budget = new BN(web3.utils.toWei('1', 'ether'));

  let contract;
  
  beforeEach(async () => {
    contract = await JobBoard.new();
  });

  describe('Job Posting', () => {
    it('should allow employers to post jobs', async () => {
      const result = await contract.postJob(
        'Web3 Developer', 
        'Build smart contracts', 
        budget, 
        { from: employer }
      );

      expectEvent(result, 'JobPosted', {
        jobId: new BN(1),
        employer,
        title: 'Web3 Developer',
        budget
      });

      const jobCount = await contract.jobCount();
      expect(jobCount).to.be.bignumber.equal(new BN(1));
    });
  });

  describe('Applications', () => {
    beforeEach(async () => {
      await contract.postJob('Job', 'Desc', budget, { from: employer });
      await contract.escrowFunds(1, { from: employer, value: budget });
    });

    it('should assign freelancers to open jobs', async () => {
      const result = await contract.applyForJob(1, { from: freelancer });
      expectEvent(result, 'JobApplied', { jobId: new BN(1), freelancer });

      const job = await contract.jobs(1);
      expect(job.freelancer).to.equal(freelancer);
      expect(job.status).to.be.bignumber.equal(new BN(1)); // ASSIGNED
    });

    it('should prevent double applications', async () => {
      await contract.applyForJob(1, { from: freelancer });
      await expectRevert(
        contract.applyForJob(1, { from: otherAccount }),
        'Job already assigned'
      );
    });
  });

  describe('Payments', () => {
    beforeEach(async () => {
      await contract.postJob('Job', 'Desc', budget, { from: employer });
      await contract.escrowFunds(1, { from: employer, value: budget });
      await contract.applyForJob(1, { from: freelancer });
    });

    it('should release payments to freelancers', async () => {
      const balanceBefore = new BN(await web3.eth.getBalance(freelancer));
      const result = await contract.releasePayment(1, { from: employer });
      
      expectEvent(result, 'PaymentReleased', {
        jobId: new BN(1),
        freelancer,
        amount: budget
      });

      const balanceAfter = new BN(await web3.eth.getBalance(freelancer));
      expect(balanceAfter.sub(balanceBefore)).to.be.bignumber.closeTo(
        budget,
        new BN(web3.utils.toWei('0.01', 'ether'))
      );
    });

    it('should prevent unauthorized payment release', async () => {
      await expectRevert(
        contract.releasePayment(1, { from: otherAccount }),
        'Only employer can call this'
      );
    });
  });

  describe('Escrow Logic', () => {
    beforeEach(async () => {
      await contract.postJob('Escrow Job', 'Test', budget, { from: employer });
      await contract.escrowFunds(1, { from: employer, value: budget });
    });

    it('should maintain locked funds until completion', async () => {
      // Check initial escrow
      let escrowed = await contract.escrowedFunds(1);
      expect(escrowed).to.be.bignumber.equal(budget);

      // Apply and check funds remain
      await contract.applyForJob(1, { from: freelancer });
      escrowed = await contract.escrowedFunds(1);
      expect(escrowed).to.be.bignumber.equal(budget);

      // Complete and verify release
      await contract.releasePayment(1, { from: employer });
      escrowed = await contract.escrowedFunds(1);
      expect(escrowed).to.be.bignumber.equal(new BN(0));
    });

    it('should reject incorrect escrow amounts', async () => {
      // Test underpayment
      await expectRevert(
        contract.escrowFunds(1, {
          from: employer,
          value: budget.sub(new BN(1))
        }),
        'Must send exact budget amount'
      );

      // Test overpayment
      await expectRevert(
        contract.escrowFunds(1, {
          from: employer,
          value: budget.add(new BN(1))
        }),
        'Must send exact budget amount'
      );
    });

    it('should prevent early fund access', async () => {
      await expectRevert(
        contract.releasePayment(1, { from: employer }),
        'Job must be assigned'
      );
    });
  });

  describe('Refund System', () => {
    beforeEach(async () => {
      await contract.postJob('Refund Job', 'Desc', budget, { from: employer });
      await contract.escrowFunds(1, { from: employer, value: budget });
    });

    it('should handle timed refunds correctly', async () => {
      // Early refund attempt
      await expectRevert(
        contract.refundEmployer(1, { from: employer }),
        'Refund delay not passed'
      );

      // Valid refund
      await time.increase(REFUND_DELAY + 1);
      const balanceBefore = new BN(await web3.eth.getBalance(employer));
      await contract.refundEmployer(1, { from: employer });
      const balanceAfter = new BN(await web3.eth.getBalance(employer));
      expect(balanceAfter).to.be.bignumber.gt(balanceBefore);
    });

    it('should prevent refunds after assignment', async () => {
      await contract.applyForJob(1, { from: freelancer });
      await expectRevert(
        contract.refundEmployer(1, { from: employer }),
        'Job must be open'
      );
    });
  });

  describe('Edge Cases', () => {
    it('should prevent applications without escrow', async () => {
      await contract.postJob('Unfunded Job', 'Desc', budget, { from: employer });
      await expectRevert(
        contract.applyForJob(1, { from: freelancer }),
        'Employer must escrow funds first'
      );
    });
  });
});