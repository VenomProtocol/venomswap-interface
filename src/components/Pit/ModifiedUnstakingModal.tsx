import React, { useState, useCallback } from 'react'
import Modal from '../Modal'
import { AutoColumn } from '../Column'
import styled from 'styled-components'
import { RowBetween } from '../Row'
import { TYPE, CloseIcon } from '../../theme'
import { ButtonError } from '../Button'
import CurrencyInputPanel from '../CurrencyInputPanel'
import { maxAmountSpend } from '../../utils/maxAmountSpend'
import { TokenAmount, Token } from '@venomswap/sdk'
import { useDerivedUnstakeInfo } from '../../state/stake/hooks'
//import { wrappedCurrencyAmount } from '../../utils/wrappedCurrency'
import { TransactionResponse } from '@ethersproject/providers'
import { useActiveWeb3React } from '../../hooks'
import { useTransactionAdder } from '../../state/transactions/hooks'
import { LoadingView, SubmittedView } from '../ModalViews'
import { usePitContract } from '../../hooks/useContract'
import { calculateGasMargin } from '../../utils'
import { PIT_SETTINGS } from '../../constants'
import useGovernanceToken from '../../hooks/useGovernanceToken'
import usePitToken from '../../hooks/usePitToken'

/*const HypotheticalRewardRate = styled.div<{ dim: boolean }>`
  display: flex;
  justify-content: space-between;
  padding-right: 20px;
  padding-left: 20px;

  opacity: ${({ dim }) => (dim ? 0.5 : 1)};
`*/

const ContentWrapper = styled(AutoColumn)`
  width: 100%;
  padding: 1rem;
`

interface StakingModalProps {
  isOpen: boolean
  onDismiss: () => void
  stakingToken: Token
  userLiquidityStaked: TokenAmount | undefined
}

export default function ModifiedStakingModal({
  isOpen,
  onDismiss,
  stakingToken,
  userLiquidityStaked
}: StakingModalProps) {
  const { chainId } = useActiveWeb3React()

  // track and parse user input
  const [typedValue, setTypedValue] = useState('')
  const { parsedAmount, error } = useDerivedUnstakeInfo(typedValue, userLiquidityStaked)

  // state for pending and submitted txn views
  const addTransaction = useTransactionAdder()
  const [attempting, setAttempting] = useState<boolean>(false)
  const [hash, setHash] = useState<string | undefined>()
  const [failed, setFailed] = useState<boolean>(false)
  const wrappedOnDismiss = useCallback(() => {
    setHash(undefined)
    setAttempting(false)
    setFailed(false)
    onDismiss()
  }, [onDismiss])

  const govToken = useGovernanceToken()
  const pitSettings = chainId ? PIT_SETTINGS[chainId] : undefined
  const pit = usePitContract()
  const pitToken = usePitToken()

  async function onWithdraw() {
    if (pit && userLiquidityStaked) {
      setAttempting(true)

      const formattedAmount = `0x${parsedAmount?.raw.toString(16)}`
      const estimatedGas = await pit.estimateGas.leave(formattedAmount)

      await pit
        .leave(formattedAmount, {
          gasLimit: calculateGasMargin(estimatedGas)
        })
        .then((response: TransactionResponse) => {
          addTransaction(response, {
            summary: `Withdraw x${govToken?.symbol} from ${pitSettings?.name}`
          })
          setHash(response.hash)
        })
        .catch((error: any) => {
          setAttempting(false)
          if (error?.code === -32603) {
            setFailed(true)
          }
          console.log(error)
        })
    }
  }

  // wrapped onUserInput to clear signatures
  const onUserInput = useCallback((typedValue: string) => {
    setTypedValue(typedValue)
  }, [])

  // used for max input button
  const maxAmountInput = maxAmountSpend(userLiquidityStaked)
  const atMaxAmount = Boolean(maxAmountInput && parsedAmount?.equalTo(maxAmountInput))

  const handleMax = useCallback(() => {
    maxAmountInput && onUserInput(maxAmountInput.toExact())
  }, [maxAmountInput, onUserInput])

  return (
    <Modal isOpen={isOpen} onDismiss={wrappedOnDismiss} maxHeight={90}>
      {!attempting && !hash && !failed && (
        <ContentWrapper gap="lg">
          <RowBetween>
            <TYPE.mediumHeader>Withdraw</TYPE.mediumHeader>
            <CloseIcon onClick={wrappedOnDismiss} />
          </RowBetween>
          <CurrencyInputPanel
            value={typedValue}
            onUserInput={onUserInput}
            onMax={handleMax}
            showMaxButton={!atMaxAmount}
            currency={pitToken}
            label={''}
            disableCurrencySelect={true}
            overrideSelectedCurrencyBalance={userLiquidityStaked}
            customBalanceText={'Available to withdraw: '}
            id="stake-liquidity-token"
          />

          <RowBetween>
            <ButtonError disabled={!!error} error={!!error && !!parsedAmount} onClick={onWithdraw}>
              {error ?? 'Withdraw'}
            </ButtonError>
          </RowBetween>
        </ContentWrapper>
      )}
      {attempting && !hash && !failed && (
        <LoadingView onDismiss={wrappedOnDismiss}>
          <AutoColumn gap="12px" justify={'center'}>
            <TYPE.largeHeader>
              Withdrawing a{govToken?.symbol} from {pitSettings?.name}
            </TYPE.largeHeader>
            <TYPE.body fontSize={20}>
              {parsedAmount?.toSignificant(4)} a{govToken?.symbol}
            </TYPE.body>
          </AutoColumn>
        </LoadingView>
      )}
      {attempting && hash && !failed && (
        <SubmittedView onDismiss={wrappedOnDismiss} hash={hash}>
          <AutoColumn gap="12px" justify={'center'}>
            <TYPE.largeHeader>Transaction Submitted</TYPE.largeHeader>
            <TYPE.body fontSize={20}>
              Withdraw {parsedAmount?.toSignificant(4)} a{govToken?.symbol}
            </TYPE.body>
          </AutoColumn>
        </SubmittedView>
      )}
      {!attempting && !hash && failed && (
        <ContentWrapper gap="sm">
          <RowBetween>
            <TYPE.mediumHeader>
              <span role="img" aria-label="wizard-icon" style={{ marginRight: '0.5rem' }}>
                ⚠️
              </span>
              Error!
            </TYPE.mediumHeader>
            <CloseIcon onClick={wrappedOnDismiss} />
          </RowBetween>
          <TYPE.subHeader style={{ textAlign: 'center' }}>
            Your transaction couldn&apos;t be submitted.
            <br />
            You may have to increase your Gas Price (GWEI) settings!
          </TYPE.subHeader>
        </ContentWrapper>
      )}
    </Modal>
  )
}
