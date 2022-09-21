import {
  createFdp,
  createUsableBatch,
  generateRandomHexString,
  generateUser,
  isUsableBatchExists,
  setCachedBatchId,
  topUpAddress,
  topUpFdp,
  waitFairOS,
} from '../utils'
import { FairOSApi } from '../utils/fairos-api'
import { Wallet, utils } from 'ethers'

jest.setTimeout(400000)
describe('Fair Data Protocol with FairOS-dfs', () => {
  beforeAll(async () => {
    const batchId = await createUsableBatch()
    setCachedBatchId(batchId)

    await waitFairOS()
  })

  it('check default batch usability', async () => {
    expect(await isUsableBatchExists()).toBe(true)
  })

  it('should register in fdp and login in fairos', async () => {
    const fairos = new FairOSApi()
    const fdp = createFdp()
    const user = generateUser(fdp)
    await topUpFdp(fdp)
    const nameHash = utils.namehash(`${user.username}.fds`)
    const publicKey = Wallet.fromMnemonic(user.mnemonic).publicKey.replace('0x', '')
    await fdp.account.register(user.username, user.password)
    const response = await fairos.login(user.username, user.password)
    expect(response.status).toEqual(200)
    expect(response.data).toStrictEqual({
      address: user.address,
      name_hash: nameHash,
      public_key: publicKey,
      message: 'user logged-in successfully',
    })
  })

  it('should register in fairos and login in fdp', async () => {
    const fairos = new FairOSApi()
    const fdp = createFdp()
    const user = generateUser()
    const nameHash = utils.namehash(`${user.username}.fds`)
    const publicKey = Wallet.fromMnemonic(user.mnemonic).publicKey.replace('0x', '')
    await topUpAddress(fdp.ens, user.address)

    const response = await fairos.register(user.username, user.password, user.mnemonic)
    expect(response.status).toEqual(201)
    expect(response.data).toStrictEqual({
      address: user.address,
      name_hash: nameHash,
      public_key: publicKey,
      message: 'user signed-up successfully',
    })

    const data = await fdp.account.login(user.username, user.password)
    expect(data.address).toEqual(user.address)
  })

  it('import account to fairos', async () => {
    const fairos = new FairOSApi()
    const fdp = createFdp()
    const user = generateUser(fdp)
    const response = await fairos.registerV1(user.username, user.password, user.mnemonic)
    expect(response.status).toEqual(201)
    expect(response.data.address).toEqual(user.address)
  })

  it('should create pods in fdp and list them in fairos', async () => {
    const fairos = new FairOSApi()
    const fdp = createFdp()
    const user = generateUser(fdp)
    const podName1 = generateRandomHexString()
    const podName2 = generateRandomHexString()
    await fdp.account.setAccountFromMnemonic(user.mnemonic)
    await fdp.personalStorage.create(podName1)
    await fairos.registerV1(user.username, user.password, user.mnemonic)
    const response = await fairos.podLs()
    expect(response.status).toEqual(200)
    expect(response.data).toStrictEqual({
      pod_name: [podName1],
      shared_pod_name: [],
    })

    await fdp.personalStorage.create(podName2)
    const response2 = await fairos.podLs()
    expect(response2.status).toEqual(200)
    expect(response2.data).toStrictEqual({
      pod_name: [podName1, podName2],
      shared_pod_name: [],
    })
  })

  it('should create pods in fairos and list them in fdp', async () => {
    const fairos = new FairOSApi()
    const fdp = createFdp()
    const user = generateUser()
    const podName1 = generateRandomHexString()
    const podName2 = generateRandomHexString()
    const podName3 = generateRandomHexString()

    await fairos.registerV1(user.username, user.password, user.mnemonic)
    const createResponse = await fairos.podNew(podName1, user.password)
    expect(createResponse.status).toEqual(201)
    expect(createResponse.data).toStrictEqual({ message: 'pod created successfully' })

    await fdp.account.setAccountFromMnemonic(user.mnemonic)
    const fdpResponse = await fdp.personalStorage.list()
    expect(fdpResponse).toEqual({ pods: [{ name: podName1, index: 1 }], sharedPods: [] })

    await fairos.podNew(podName2, user.password)
    const fdpResponse2 = await fdp.personalStorage.list()
    expect(fdpResponse2).toEqual({
      pods: [
        { name: podName1, index: 1 },
        { name: podName2, index: 2 },
      ],
      sharedPods: [],
    })

    await fdp.personalStorage.create(podName3)
    const response2 = await fairos.podLs()
    expect(response2.status).toEqual(200)
    const pods = response2.data.pod_name
    // sometimes pods return in different order, so they couldn't be strictly compared
    expect(pods).toHaveLength(3)
    expect(pods).toContain(podName1)
    expect(pods).toContain(podName2)
    expect(pods).toContain(podName3)
  })

  it('should create directories in fdp and list them in fairos', async () => {
    const fairos = new FairOSApi()
    const fdp = createFdp()
    const user = generateUser(fdp)
    const podName1 = generateRandomHexString()
    const directoryName1 = generateRandomHexString()
    const fullDirectoryName1 = '/' + directoryName1
    const subDirectoryName1 = generateRandomHexString()
    const fullSubDirectoryName1 = fullDirectoryName1 + '/' + subDirectoryName1
    const directoryName2 = generateRandomHexString()
    const fullDirectoryName2 = '/' + directoryName2

    await fdp.account.setAccountFromMnemonic(user.mnemonic)
    await fdp.personalStorage.create(podName1)
    await fdp.directory.create(podName1, fullDirectoryName1)
    await fairos.registerV1(user.username, user.password, user.mnemonic)
    await fairos.podOpen(podName1, user.password)
    const response = await fairos.dirLs(podName1)
    expect(response.status).toEqual(200)
    expect(response.data?.dirs).toHaveLength(1)
    const dir1 = response.data.dirs[0]
    expect(dir1.name).toEqual(directoryName1)
    expect(dir1.content_type).toEqual('inode/directory')
    expect(dir1.creation_time).toBeDefined()
    expect(dir1.modification_time).toBeDefined()
    expect(dir1.access_time).toBeDefined()

    await fdp.directory.create(podName1, fullSubDirectoryName1)
    await fdp.directory.create(podName1, fullDirectoryName2)
    const response2 = await fairos.dirLs(podName1)
    expect(response2.data?.dirs).toHaveLength(2)
    const dirs2 = response2.data?.dirs
    expect(dirs2[0].name).toEqual(directoryName1)
    expect(dirs2[1].name).toEqual(directoryName2)

    const data3 = (await fairos.dirLs(podName1, fullDirectoryName1)).data
    const dirs3 = data3.dirs
    const dir3 = dirs3[0]
    expect(dirs3).toHaveLength(1)
    expect(dir3.name).toEqual(subDirectoryName1)
    expect(dir3.content_type).toEqual('inode/directory')
    expect(dir3.creation_time).toBeDefined()
    expect(dir3.modification_time).toBeDefined()
    expect(dir3.access_time).toBeDefined()
  })
})
