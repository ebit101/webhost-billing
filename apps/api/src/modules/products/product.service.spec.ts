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
      }).map((issue) => issue.field),
    ).toEqual([
      'hostingPackageIdentifier',
      'storageFeature',
      'websiteFeature',
      'emailFeature',
      'bandwidthFeature',
      'prices',
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
