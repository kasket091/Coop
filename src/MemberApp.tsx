import { useEffect, useState } from 'react'
import { IconBell, IconLoans, IconPay, IconSavings, IconUser } from './icons'
import { AccountTab, AlertsTab, LoansTab } from './member-tabs'
import { unpaidLoans, type LoanRequest } from './requests'
import { AdvanceSavings, PaySavingsButton } from './pay-dialogs'
import { advanceMonths } from './payments'
import type { PaymentRequest } from './payments'
import { CoopSection, MySavings } from './savings'
import { Loading, Shell, type TabDef } from './Shell'
import { signOutUser, summaryFor, watchComakerRequests, watchMember, watchMyPaymentRequests, watchMyRequests, watchMyTransactions, watchSummary, type StoredMember, type Summary, type Txn } from './store'
import { PayRules } from './tabs'

type Tab = 'savings' | 'loans' | 'alerts' | 'pay' | 'account'

export function MemberApp({ uid, year }: { uid: string; year: number }) {
  const [me, setMe] = useState<StoredMember | null | undefined>(undefined)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [mine, setMine] = useState<LoanRequest[]>([])
  const [asked, setAsked] = useState<LoanRequest[]>([])
  const [txns, setTxns] = useState<Txn[]>([])
  const [payments, setPayments] = useState<PaymentRequest[]>([])
  const [tab, setTab] = useState<Tab>('savings')
  const [advance, setAdvance] = useState<number | null>(null) // the future month tapped to pay ahead

  useEffect(() => watchMember(uid, setMe), [uid])
  useEffect(() => watchSummary(setSummary), [])
  useEffect(() => watchMyRequests(uid, setMine), [uid])
  useEffect(() => watchMyTransactions(uid, setTxns), [uid])
  useEffect(() => watchMyPaymentRequests(uid, setPayments), [uid])
  useEffect(() => (me?.founder ? watchComakerRequests(uid, setAsked) : undefined), [uid, me?.founder])

  if (me === undefined) return <Shell year={year}><Loading /></Shell>
  if (me === null) {
    // signed in, but the admin removed this member (or reset their login)
    return (
      <Shell year={year}>
        <div className="error" role="alert">
          <h1>This account is no longer active</h1>
          <p>Ask the admin if you think this is a mistake.</p>
          <button className="btn" onClick={() => signOutUser()}>Log out</button>
        </div>
      </Shell>
    )
  }

  const waiting = asked.filter((r) => r.status === 'pending' && r.comakers[uid]?.status === 'pending').length
  const tabs: TabDef<Tab>[] = [
    { id: 'savings', label: 'Savings', Icon: IconSavings },
    { id: 'loans', label: 'Loans', Icon: IconLoans },
    ...(me.founder ? [{ id: 'alerts' as const, label: 'Alerts', Icon: IconBell, badge: waiting }] : []),
    { id: 'pay', label: 'Pay & Rules', Icon: IconPay },
    { id: 'account', label: 'Account', Icon: IconUser },
  ]

  return (
    <Shell year={year} tabs={tabs} current={tab} onTab={setTab}>
      {tab === 'savings' && <><MySavings m={me} coop={summaryFor(summary, me)} year={year} extra={<PaySavingsButton me={me} year={year} waiting={payments} />}
        advanceable={me.terminated ? [] : advanceMonths(me, new Date(), year, payments)} onAdvance={setAdvance}
        termination={me.terminated ? { ...me.terminated, unpaid: unpaidLoans(mine, uid, me.sheetLoanBalance ?? 0).total } : undefined} />
        {advance !== null && <AdvanceSavings me={me} year={year} mine={mine} txns={txns} waiting={payments} start={advance}
          onClose={() => setAdvance(null)} onLoans={() => { setTab('loans'); scrollTo(0, 0) }} />}
        <CoopSection summary={summary} /></>}
      {tab === 'loans' && <LoansTab me={me} year={year} mine={mine} txns={txns} payments={payments} onPay={() => { setTab('pay'); scrollTo(0, 0) }} />}
      {tab === 'alerts' && me.founder && <AlertsTab me={me} asked={asked} />}
      {tab === 'pay' && <PayRules />}
      {tab === 'account' && <AccountTab me={me} />}
    </Shell>
  )
}
