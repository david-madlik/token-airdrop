import { Injectable } from '@angular/core';
import Web3Modal, { IProviderOptions } from "web3modal";
import { Config } from 'src/config';
import { BigNumber, Contract, ethers, providers, Signer } from 'ethers'
import WalletConnectProvider from '@walletconnect/web3-provider';
import { AppState } from 'src/appState';
import { Web3Provider, JsonRpcProvider } from '@ethersproject/providers';

@Injectable({
  providedIn: 'root'
})
export class Web3ModalService {
  public static instance: Web3ModalService | null = null;
  walletProvider: any | null = null;
  web3Provider: Web3Provider | null = null
  signer: Signer | null = null
  airdropContract: Contract | null = null;
  presaleContract: Contract | null = null;

  notLoggedProvider: JsonRpcProvider
  airdropNotLoggedContract: Contract;
  taxTokenNotLoggedContract: Contract | null = null;
  presaleNotLoggedContract: Contract;

  tokenDecimalsPromise: Promise<boolean>;

  constructor() {
    this.notLoggedProvider = new JsonRpcProvider(Config.main.network);
    this.airdropNotLoggedContract = new ethers.Contract(Config.main.addressAirdrop, Config.main.airdropContractInterface, this.notLoggedProvider);
    this.notLoggedProvider.getBlock(this.notLoggedProvider._lastBlockNumber).then(block => {
      AppState.reduceActualTimestamp = (block.timestamp * 1000 - Date.now()) / 1000;
    });
    this.tokenDecimalsPromise = new Promise(async (resolve) => {
      this.airdropNotLoggedContract.token().then(async (value: BigNumber) => {
        AppState.token.address = value.toHexString();
        this.taxTokenNotLoggedContract = new ethers.Contract( AppState.token.address , Config.main.tokenContractInterface, this.notLoggedProvider);
        this.taxTokenNotLoggedContract.name().then((value: string) => {
          AppState.token.name = value;
        });
        this.taxTokenNotLoggedContract.symbol().then((value: string) => {
          AppState.token.symbol = value;
        });
        const decimals: BigNumber = await this.taxTokenNotLoggedContract.decimals();
        AppState.token.decimals = decimals.toNumber();
        resolve(true);
      });
      Web3ModalService.instance = this;
    });

    this.presaleNotLoggedContract = new ethers.Contract(Config.main.addressPresale, Config.main.presaleContractInterface, this.notLoggedProvider);
    this.initializePresale();
    
    this.tryConnect();
  }

  private initializePresale(){
    this.presaleNotLoggedContract.tokenTheir().then((value: BigNumber) => {
      AppState.presale.tokenTheir.address = value.toHexString();
      const contract = new ethers.Contract( AppState.presale.tokenTheir.address, Config.main.tokenContractInterface, this.notLoggedProvider);
      contract.name().then((value: string) => { AppState.presale.tokenTheir.name = value; });
      contract.symbol().then((value: string) => { AppState.presale.tokenTheir.symbol = value; });
      const decimalsPromise =contract.decimals().then((value: BigNumber) => { AppState.presale.tokenTheir.decimals = value.toNumber(); });
      this.presaleNotLoggedContract.tokenPrice().then(async (value: BigNumber) => { 
        await decimalsPromise;
        AppState.presale.tokenPrice = AppState.reduceTheirDecimals(value); 
      });
      this.presaleNotLoggedContract.totalDeposited().then(async (value: BigNumber) => { 
        await decimalsPromise;
        AppState.presale.totalDeposited = AppState.reduceTheirDecimals(value); 
      });
    });
    this.presaleNotLoggedContract.tokenOur().then((value: BigNumber) => {
      AppState.presale.tokenOur.address = value.toHexString();
      const contract = new ethers.Contract( AppState.presale.tokenOur.address, Config.main.tokenContractInterface, this.notLoggedProvider);
      contract.name().then((value: string) => { AppState.presale.tokenOur.name = value; });
      contract.symbol().then((value: string) => { AppState.presale.tokenOur.symbol = value; });      
      const decimalsPromise = contract.decimals().then((value: BigNumber) => { AppState.presale.tokenOur.decimals = value.toNumber(); });
      this.presaleNotLoggedContract.getRemainingTokens().then(async (value: BigNumber) => { 
        await decimalsPromise;
        AppState.presale.remainingTokens =  AppState.reduceOurDecimals(value); 
      });
      this.presaleNotLoggedContract.totalClaimed().then(async (value: BigNumber) => { 
        await decimalsPromise;
        AppState.presale.totalClaimed = AppState.reduceOurDecimals(value); 
      });
    });
    this.presaleNotLoggedContract.claimedCount().then((value: BigNumber) => { AppState.presale.claimedCount = Number(value.toString()); });
    this.presaleNotLoggedContract.depositedCount().then((value: BigNumber) => { AppState.presale.depositedCount = Number(value.toString()); });    
    this.presaleNotLoggedContract.startTime().then((value: BigNumber) => { AppState.presale.startTime = Number(value.toString()); });
    this.presaleNotLoggedContract.claimTimeOut().then((value: BigNumber) => { AppState.presale.claimTimeOut = Number(value.toString()); });
    this.presaleNotLoggedContract.depositTimeOut().then((value: BigNumber) => { AppState.presale.depositTimeOut = Number(value.toString()); });
  }
  
  private async reduceNumberDecimals(number: BigNumber) : Promise<number>{
    await this.tokenDecimalsPromise;
    return AppState.token.reduceDecimals(number);
  }


  tryConnect(){
    const cahckedproviderJson = localStorage.getItem("WEB3_CONNECT_CACHED_PROVIDER");
    if(cahckedproviderJson){
      this.web3Modal();
    }
  }

  private getWeb3ModalConnector(): Web3Modal{
    const INFURA_ID = 'c22c90a767684c5fbd7257da57802b35'
    const providerOptions : IProviderOptions = {
      walletconnect: {
        package: WalletConnectProvider, // required
        options: {
          infuraId: INFURA_ID,
          rpc: {
            137: 'https://rpc-mainnet.matic.quiknode.pro',
            80001: 'https://matic-mumbai.chainstacklabs.com'
          }
        },
      }
    }
    const web3ModalConnector = new Web3Modal({
      //network: "matic",
      cacheProvider: true, // optional
      providerOptions: providerOptions // required,
    });
    return web3ModalConnector; 
  }

  web3Modal(){
    const web3ModalConnector = this.getWeb3ModalConnector();
    web3ModalConnector.connect().then(provider => {
      this.initializeProvider(provider);
      this.web3Provider = new providers.Web3Provider(provider);
      this.walletProvider = provider;
      this.signer = this.web3Provider.getSigner();
      
      this.airdropContract = new ethers.Contract(Config.main.addressAirdrop, Config.main.airdropContractInterface, this.signer);
      this.presaleContract = new ethers.Contract(Config.main.addressPresale, Config.main.presaleContractInterface, this.signer);
      let network : ethers.providers.Network;
      
      const networkPromise = this.web3Provider?.getNetwork().then( value => {
        network = value;
      });

      this.signer?.getAddress().then( async address => {
        await networkPromise;
        AppState.selectedAddress = address;  
        AppState.chainId = network.chainId;
        if(AppState.chainId == Config.main.chainID){     
          this.airdropNotLoggedContract.addressReceived(AppState.selectedAddress).then((value: boolean) => {
            AppState.airdropRecieved = value;
          });
        }
      });
    }, reason => {
      console.log(reason);
    });
  }

  disconnect(){
    if(this.walletProvider){
      if(typeof this.walletProvider.disconnect == "function")
        this.walletProvider.disconnect();
      else if(typeof this.walletProvider._handleDisconnect == "function")
        this.walletProvider._handleDisconnect();
    }
  }

  airdrop(): Promise<ethers.Transaction> {
    return this.airdropContract?.airdrop();
  }

  private initializeProvider(provider: any){
    provider.on("accountsChanged", (accounts: string[]) => {
      location.reload();
    });
    
    // Subscribe to chainId change
    provider.on("chainChanged", (chainId: number) => {
      location.reload();
    });
    
    // Subscribe to provider connection
    provider.on("connect", (info: { chainId: number }) => {
      console.log("connect" + info.chainId);
    });
    
    // Subscribe to provider disconnection
    provider.on("disconnect", (error: { code: number; message: string }) => {
      this.getWeb3ModalConnector().clearCachedProvider();
      AppState.selectedAddress = null;
      AppState.chainId = null;
      AppState.airdropRecieved = null;
      this.walletProvider = null;
      this.airdropContract = null
    });
  }
  
   getCurrentBlock():  Promise<Number> {
    return this.notLoggedProvider.getBlockNumber();
   }
  
   async getAmountOfTokens() : Promise<number>{
    return new Promise(async (resolve) => {
      const ret: BigNumber = await this.airdropNotLoggedContract.amountOfTokens();
      resolve(this.reduceNumberDecimals(ret));
    });
   }

   async getRemainingTokens() : Promise<number>{
    return new Promise(async (resolve) => {
      const ret: BigNumber  = await this.airdropNotLoggedContract.remainingTokens();
      resolve(this.reduceNumberDecimals(ret));
    });
   }

   async getTotalClaimed() : Promise<number>{
    return new Promise(async (resolve) => {
      const ret: BigNumber  = await this.airdropNotLoggedContract.totalClaimed();
      resolve(this.reduceNumberDecimals(ret));
    });
   }

   async getAirdropsCount() : Promise<number>
   {
    return new Promise(async (resolve) => {
      const ret: BigNumber = await this.airdropNotLoggedContract.airdropsCount();
      resolve(ret.toNumber());
    });
   }

   presaleClaimed(address: string) : Promise<number>{
     return new Promise(async (resolve) => {
        const ret: BigNumber = await this.presaleNotLoggedContract.claimed(address);
        resolve(AppState.reduceOurDecimals(ret));
     });
   }

   presaleDeposited(address: string) : Promise<number>{
    return new Promise(async (resolve) => {
       const ret: BigNumber = await this.presaleNotLoggedContract.deposited(address);
       resolve(AppState.reduceTheirDecimals(ret));
    });
  }

  presaleDeposit(amount: number): Promise<ethers.Transaction> {
    const b = BigInt(amount * (10 ** AppState.presale.tokenTheir.decimals));
    const bn = BigNumber.from(b);
    console.log("deposit(" + bn.toString() + ")");
    return this.presaleContract?.deposit(bn);
  }

  presaleClaim(): Promise<ethers.Transaction> {
    return this.presaleContract?.claim();
  }
}
