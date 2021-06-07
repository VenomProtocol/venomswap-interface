import { ExtensionAccount, Harmony, HarmonyExtension } from '@harmony-js/core'
import { HarmonyAddress } from '@harmony-js/crypto'
import { AbstractConnectorArguments, ConnectorUpdate } from '@web3-react/types'
import { AbstractConnector } from '@web3-react/abstract-connector'

class HmyWalletProvider {
  private ext: HarmonyExtension
  public hmy: Harmony

  constructor(ext: HarmonyExtension, rpc?: string) {
    this.ext = ext
    this.hmy = new Harmony(rpc ?? ext.provider.url, {
      chainType: ext.messenger.chainType,
      chainId: 1
    })

    this.ext.provider = this.hmy.messenger.provider
    this.ext.messenger = this.hmy.messenger
    this.ext.setShardID(0)
    this.ext.wallet.messenger = this.hmy.messenger
    this.ext.blockchain.messenger = this.hmy.messenger
    this.ext.transactions.messenger = this.hmy.messenger
    this.ext.contracts.wallet = this.hmy.wallet
  }

  public async send_eth(payload: any): Promise<any> {
    if (payload?.method) return await this.ext.messenger.send(payload.method, payload.params, 'eth', 0)
    return await this.ext.messenger.send(payload, [], 'eth', 0)
  }

  public async send(payload: any, callback?: any): Promise<any> {
    if (payload?.method === 'eth_sendTransaction') {
      const txn = this.ext.transactions.newTx({
        from: new HarmonyAddress(payload.params[0].from).bech32,
        to: new HarmonyAddress(payload.params[0].to).bech32,
        data: payload.params[0].data,
        gasLimit: parseInt(payload.params[0].gas),
        gasPrice: '0x00000000001',
        shardID: 0,
        toShardID: 0
      })

      const signedTxn = await (window as any).onewallet.signTransaction(txn)
      return await this.ext.provider.send(
        {
          method: 'hmy_sendRawTransaction',
          params: [signedTxn['rawTransaction']],
          id: payload.id,
          jsonrpc: payload.jsonrpc
        },
        callback
      )
    }
    return await this.ext.provider.send(payload, callback)
  }
}

interface HmyWalletConnectorArguments extends AbstractConnectorArguments {
  rpc?: string
}

export class HmyWalletConnector extends AbstractConnector {
  private ext?: HarmonyExtension
  private provider?: HmyWalletProvider
  private rpc?: string
  private account: string | null
  private auth: boolean

  constructor(kwargs: HmyWalletConnectorArguments) {
    super(kwargs)
    this.rpc = kwargs.rpc
    this.account = null
    this.auth = false
  }

  public async activate(): Promise<ConnectorUpdate> {
    this.ext = new HarmonyExtension((window as any).onewallet)
    return this.ext.login().then(async (account: ExtensionAccount) => {
      if (this.ext) {
        this.account = this.ext.crypto.fromBech32(account.address)
        this.auth = true
        this.provider = new HmyWalletProvider(this.ext, this.rpc)
        return {
          provider: this.provider,
          account: this.account
        }
      }
      return {}
    })
  }

  public async getProvider(): Promise<any> {
    return this.provider
  }

  public async getChainId(): Promise<number | string> {
    return this.provider ? parseInt((await this.provider.send_eth('eth_chainId')).result) : -1
  }

  public async getAccount(): Promise<null | string> {
    return this.account
  }

  public deactivate() {
    this.ext
      ?.logout()
      .then(() => {
        this.auth = false
        return Promise.resolve()
      })
      .catch((error: Error) => {
        console.log(error)
      })
  }

  public async isAuthorized(): Promise<boolean> {
    return this.auth
  }
}
