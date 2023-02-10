import path from 'path';
import EmbeddedDependenciesWebpackPlugin from '../';
import { Testing } from '@rushstack/webpack-plugin-utilities';
import { FileSystem } from '@rushstack/node-core-library';

const TESTS_FOLDER_PATH: string = path.resolve(path.join(process.cwd(), 'src', 'test'));
const FIXTURES_FOLDER_PATH: string = path.resolve(path.join(TESTS_FOLDER_PATH, 'fixtures'));

const fixtures: string[] = FileSystem.readFolderItemNames(FIXTURES_FOLDER_PATH);

console.log(fixtures);

const defaultConfigurationWithPlugin = {
  context: TESTS_FOLDER_PATH,
  plugins: [new EmbeddedDependenciesWebpackPlugin()],
  resolve: {
    // Have a centralized mock node_modules folder which contains fake and
    // real examples of node_modules with valid/invalid licenses
    modules: ['...']
  }
};

for (const fixture of fixtures) {
  describe('WebpackEmbeddedDependenciesPlugin', () => {
    it('should run', async () => {
      const stats = await Testing.getTestingWebpackCompiler(
        `./fixtures/${fixture}/src`,
        defaultConfigurationWithPlugin
      );
      expect(stats).toBeDefined();
    });
  });
}
