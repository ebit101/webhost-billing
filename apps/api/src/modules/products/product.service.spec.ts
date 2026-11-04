import { activationValidationIssues } from './product.service';

describe('product activation rules', () => {
  it('requires provisioning, display features, and an active price', () => {
    expect(
      activationValidationIssues({
        hostingPackageIdentifier: null,
        storageFeature: null,
        websiteFeature: null,
        emailFeature: null,
        bandwidthFeature: null,
        activePriceCount: 0,
      }),
    ).toEqual([
      {
        field: 'hostingPackageIdentifier',
        message: 'Enter the cPanel package identifier in Details.',
      },
      {
        field: 'storageFeature',
        message: 'Fill in Storage display in Details.',
      },
      {
        field: 'websiteFeature',
        message: 'Fill in Websites display in Details.',
      },
      { field: 'emailFeature', message: 'Fill in Email display in Details.' },
      {
        field: 'bandwidthFeature',
        message: 'Fill in Bandwidth display in Details.',
      },
      { field: 'prices', message: 'Add at least one active price in Pricing.' },
    ]);
  });

  it('accepts a complete product without weakening visibility rules', () => {
    expect(
      activationValidationIssues({
        hostingPackageIdentifier: 'business_pkg',
        storageFeature: '30 GB SSD',
        websiteFeature: '5 websites',
        emailFeature: '50 email accounts',
        bandwidthFeature: 'Unlimited',
        activePriceCount: 1,
      }),
    ).toEqual([]);
  });
});
