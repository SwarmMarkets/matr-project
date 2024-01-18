import hre from 'hardhat';
const { ethers } = hre;

async function main(): Promise<void> {
  const [owner] = await ethers.getSigners();
  await hre.run('verify:verify', {
    address: '0x78320DcFC452285BAe0289c7c6C919f0C4948B42',
    constructorArguments: []
  });

}


// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
